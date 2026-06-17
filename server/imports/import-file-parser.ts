import "server-only";

import Papa from "papaparse";
import * as XLSX from "xlsx";

import {
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_ROWS,
  SUPPORTED_IMPORT_EXTENSIONS,
} from "@/lib/imports";
import { AppError } from "@/server/errors";

export type ParsedImportFile = {
  sheetName: string | null;
  rows: string[][];
  rowCount: number;
};

const DANGEROUS_CELL_PREFIX = /^[=+\-@]/;

export function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  const stringValue = String(value).trim();

  if (DANGEROUS_CELL_PREFIX.test(stringValue)) {
    return `'${stringValue}`;
  }

  return stringValue;
}

export function validateImportFileMeta(
  fileName: string,
  mimeType: string,
  fileSize: number,
  maxFileSize: number,
): void {
  const extension = getFileExtension(fileName);

  if (!SUPPORTED_IMPORT_EXTENSIONS.includes(extension as (typeof SUPPORTED_IMPORT_EXTENSIONS)[number])) {
    throw new AppError(
      "VALIDATION_ERROR",
      "Unsupported file type. Upload a CSV or Excel file.",
    );
  }

  if (fileSize <= 0) {
    throw new AppError("VALIDATION_ERROR", "The uploaded file is empty.");
  }

  if (fileSize > maxFileSize) {
    throw new AppError(
      "VALIDATION_ERROR",
      `File is too large. Maximum size is ${Math.round(maxFileSize / (1024 * 1024))} MB.`,
    );
  }

  const allowedMimePrefixes = [
    "text/",
    "application/csv",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
  ];

  const mimeAllowed = allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix));

  if (!mimeAllowed && mimeType !== "application/csv") {
    throw new AppError(
      "VALIDATION_ERROR",
      "Unsupported file type. Upload a CSV or Excel file.",
    );
  }
}

function getFileExtension(fileName: string): string {
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : "";
}

export function parseImportFile(
  buffer: Buffer,
  fileName: string,
): ParsedImportFile {
  const extension = getFileExtension(fileName);

  if (extension === ".csv") {
    return parseCsvBuffer(buffer);
  }

  if (extension === ".xlsx" || extension === ".xls") {
    return parseExcelBuffer(buffer);
  }

  throw new AppError(
    "VALIDATION_ERROR",
    "Unsupported file type. Upload a CSV or Excel file.",
  );
}

function parseCsvBuffer(buffer: Buffer): ParsedImportFile {
  const text = buffer.toString("utf-8");

  const result = Papa.parse<string[]>(text, {
    header: false,
    skipEmptyLines: "greedy",
    dynamicTyping: false,
  });

  if (result.errors.length > 0) {
    throw new AppError(
      "VALIDATION_ERROR",
      `Failed to parse CSV: ${result.errors[0]?.message ?? "Unknown error"}`,
    );
  }

  const rows = normalizeRows(result.data);

  return {
    sheetName: null,
    rows,
    rowCount: rows.length,
  };
}

function parseExcelBuffer(buffer: Buffer): ParsedImportFile {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: false });

  const sheetName = workbook.SheetNames[0];

  if (!sheetName) {
    throw new AppError("VALIDATION_ERROR", "The Excel file contains no sheets.");
  }

  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new AppError("VALIDATION_ERROR", "Failed to read the Excel sheet.");
  }

  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const rows = normalizeRows(rawRows);

  return {
    sheetName,
    rows,
    rowCount: rows.length,
  };
}

function normalizeRows(rawRows: unknown[]): string[][] {
  const rows = rawRows
    .filter((row) => Array.isArray(row) && row.some((cell) => sanitizeCellValue(cell) !== ""))
    .map((row) =>
      (row as unknown[])
        .slice(0, MAX_IMPORT_COLUMNS)
        .map((cell) => sanitizeCellValue(cell)),
    );

  if (rows.length === 0) {
    throw new AppError("VALIDATION_ERROR", "The file contains no data rows.");
  }

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new AppError(
      "VALIDATION_ERROR",
      `File exceeds the maximum of ${MAX_IMPORT_ROWS.toLocaleString()} rows.`,
    );
  }

  const maxColumns = Math.max(...rows.map((row) => row.length));

  return rows.map((row) => {
    const padded = [...row];
    while (padded.length < maxColumns) {
      padded.push("");
    }
    return padded;
  });
}

export function extractHeadersAndDataRows(
  rows: string[][],
  hasHeaderRow: boolean,
  headerRowIndex: number,
): {
  headers: string[];
  dataRows: string[][];
} {
  if (rows.length === 0) {
    return { headers: [], dataRows: [] };
  }

  const safeHeaderIndex = Math.max(0, Math.min(headerRowIndex, rows.length - 1));

  if (hasHeaderRow) {
    const headerRow = rows[safeHeaderIndex] ?? [];
    const headers = headerRow.map((cell, index) => {
      const trimmed = cell.trim();
      return trimmed || columnLabel(index);
    });

    const dataRows = rows.slice(safeHeaderIndex + 1);
    return { headers, dataRows };
  }

  const columnCount = rows[0]?.length ?? 0;
  const headers = Array.from({ length: columnCount }, (_, index) => columnLabel(index));
  const dataRows = rows.slice(safeHeaderIndex);

  return { headers, dataRows };
}

function columnLabel(index: number): string {
  let label = "";
  let value = index;

  do {
    label = String.fromCharCode(65 + (value % 26)) + label;
    value = Math.floor(value / 26) - 1;
  } while (value >= 0);

  return `Column ${label}`;
}

export function detectDuplicateHeaders(headers: string[]): string[] {
  const seen = new Map<string, number>();
  const duplicates: string[] = [];

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    const count = (seen.get(normalized) ?? 0) + 1;
    seen.set(normalized, count);

    if (count === 2) {
      duplicates.push(header);
    }
  }

  return duplicates;
}
