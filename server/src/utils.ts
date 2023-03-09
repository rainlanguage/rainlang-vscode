import { Range, Position } from "vscode-languageserver";
import { TextDocument } from 'vscode-languageserver-textdocument';
import { getOpMetaFromSg, RainDocument } from '@rainprotocol/rainlang';


// gets the op meta from subgraph
export async function getOpMeta(config: {
	deployerAddress: string, 
	source: {
		chainId?: number,
		subgraphUrl?: string
	}
}): Promise<string> {
	try {
		if (Object.keys(config.source).length === 0) {
			return await getOpMetaFromSg(config.deployerAddress);
		}
		else {
			if (Object.keys(config.source).length === 2) {
				try {
					return await getOpMetaFromSg(config.deployerAddress, config.source.subgraphUrl!);
				}
				catch {
					try {
						return await getOpMetaFromSg(config.deployerAddress, config.source.chainId!);
					}
					catch {
						return "";
					}
				}
			}
			else {
				if ("chainId" in config.source) return await getOpMetaFromSg(
					config.deployerAddress, 
					config.source.chainId
				);
				else return await getOpMetaFromSg(config.deployerAddress, config.source.subgraphUrl!);
			}
		}
	}
	catch {
		return "";
	}
}

// get inline rainlang strings in js or ts files
export function embeddedRainlang(
	textDocument: TextDocument,
	opmeta: string
): {rainDocument: RainDocument, range: Range, hasLiteralTemplate: boolean}[] | undefined {
	let _text = textDocument.getText();
	const _result: {rainDocument: RainDocument, range: Range, hasLiteralTemplate: boolean}[] = [];
	while (_text.search(/rainlang`[^]*`/) > -1) {
		const _match = _text.match(/rainlang`[^]*`/);
		const _doc = _match![0];
		const _startIndex = _match!.index!;
		const _startPos = textDocument.positionAt(_startIndex);
		const _endIndex = _startIndex + _doc!.length;
		const _endPos = textDocument.positionAt(_endIndex);
		_result.push({
			rainDocument: new RainDocument(
				TextDocument.create(`inline:${_result.length}`, "rainlang", 1, _doc.slice(9, -1)),
				opmeta
			),
			range: Range.create(_startPos, _endPos),
			hasLiteralTemplate: _doc.includes("${")
		});
		_text = _text.replace(_doc, _doc!.replace(/./g, " "));
	}
	if (_result.length) return _result;
	else return undefined;
}



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