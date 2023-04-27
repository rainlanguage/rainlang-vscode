import { Range, Position } from "vscode-languageserver";

// checks if a position is in range
export function isInRange(range: Range, position: Position): boolean {
    if (position.line < range.start.line || position.line > range.end.line) return false;
    else {
        if (position.line === range.start.line) {
            if (position.character < range.start.character) return false;
            else {
                if (range.start.line === range.end.line) {
                    if (position.character > range.end.character) return false;
                    else return true;
                }
                else return true;
            }
        }
        else if (position.line === range.end.line) {
            if (position.character > range.end.character) return false;
            else return true;
        }
        else return true;
    }
}

// checks for empty range
export function isEmptyRange(range: Range): boolean {
    if (range.start.line === range.end.line) {
        if (range.start.character === range.end.character) return true;
        else return false;
    }
    else return false;
}

// check if 2 ranges match exactly together
export function matchRange(range1: Range, range2: Range): boolean {
    if (
        range1.start.line === range2.start.line &&
		range1.end.line === range2.end.line &&
		range1.start.character === range2.start.character &&
		range1.end.character === range2.end.character
    ) return true;
    else return false;
}