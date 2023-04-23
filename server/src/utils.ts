import { Range, Position } from "vscode-languageserver";
import { TextDocument } from "vscode-languageserver-textdocument";
import { getOpMetaFromSg, RainDocument } from "@rainprotocol/rainlang";


// gets the op meta from subgraph
export async function getOpMeta(config: {
	deployerAddress: string, 
	source: string | number,
}): Promise<string> {
    try {
        if (typeof config.source === "number") return await getOpMetaFromSg(
            config.deployerAddress, 
            config.source
        );
        else return await getOpMetaFromSg(
            config.deployerAddress, 
            config.source
        );
    }
    catch {
        return "";
    }
}

// get inline rainlang strings in js or ts files
export function embeddedRainlang(doc: TextDocument, opmeta: string): Promise<{
    rainDocument: RainDocument, 
    range: Range
}[]> {
    const _text = doc.getText();
    const _result: {rainDocument: RainDocument, range: Range}[] = [];

    let _inlineRainlangs: [string, number | undefined][] = Array.from(
        _text.matchAll(/rainlang`[^]*`/g)
    ).map(v => [v[0], v.index]);

    _inlineRainlangs = _inlineRainlangs.filter(v => v[1] !== undefined);
    
    const _td = TextDocument.create("tmp", "tmp", 0, _text);
    _inlineRainlangs.forEach(v => {
        fillInside(
            _td, 
            Range.create(
                doc.positionAt(v[1]! + 9), 
                doc.positionAt(v[1]! + v[0].length - 1)
            )
        );
    });

    _inlineRainlangs = _inlineRainlangs.filter(v => isInJsCommentRange(_td, v[1]!) === false);

    _inlineRainlangs.forEach((v, i) => {
        const range = Range.create(
            doc.positionAt(v[1]! + 9), 
            doc.positionAt(v[1]! + v[0].length - 1)
        );
        let content = fillOutside(
            TextDocument.create("tmp", "tmp", 0, _text), 
            range
        );
        const _templates: [string, number | undefined][] = Array.from(
            content.matchAll(/\$\{[^]*\}/g)
        ).map(v => [v[0], v.index]);
        _templates.filter(
            v => v[1] !== undefined
        ).forEach(
            v => { 
                let injection = v[0].replace(/[^\s]/g, " ");
                injection = "1" + injection.slice(1);
                content = 
                    content.slice(0, v[1]!) + 
                    injection + 
                    content.slice(v[1]! + v[0].length);
            }
        );
        _result.push({
            range,
            rainDocument: new RainDocument(
                TextDocument.create(
                    "inline-" + i.toString()+ "-" + doc.uri,
                    "rainlang",
                    0,
                    content
                ),
                opmeta
            )
        });
    });
    return Promise.resolve(_result);
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

// check if a position is in range of js comment
export function isInJsCommentRange(doc: TextDocument, index: number): boolean {
    const pos = doc.positionAt(index);

    // check for comment lines
    if (doc.getText(Range.create(Position.create(pos.line, 0), pos)).includes("//")) {
        return true;
    }

    // check for comment blocks
    const _commentBlocks: [string, number | undefined][] = Array.from(
        doc.getText().matchAll(/\/\*[^]*\*\//g)
    ).map(v => [v[0], v.index]);
    if (_commentBlocks.length) {
        for (let i = 0; i < _commentBlocks.length; i++) {
            if (_commentBlocks[i][1] !== undefined) {
                if (
                    isInRange(
                        Range.create(
                            doc.positionAt(_commentBlocks[i][1]! + 2), 
                            doc.positionAt(
                                _commentBlocks[i][1]! + _commentBlocks[i][0].length - 2
                            )
                        ),
                        pos
                    )
                ) return true;
            }
        }
        return false;
    }
    else return false;
}

// replace non related content with whitespace
export function fillOutside(doc: TextDocument, keep: Range): string {
    const preRange = Range.create(Position.create(0, 0), keep.start);
    const postRange = Range.create(keep.end, doc.positionAt(doc.getText().length));
    const preText = doc.getText(preRange).replace(/[^\s]/g, " ");
    const postText = doc.getText(postRange).replace(/[^\s]/g, " ");
    return TextDocument.applyEdits(
        doc, 
        [
            { range: preRange, newText: preText },
            { range: postRange, newText: postText }
        ]
    );
}

// replace content with whitespace
export function fillInside(doc: TextDocument, range: Range) {
    const text = doc.getText(range).replace(/[^\s]/g, " ");
    TextDocument.update(doc, [{ range, text }], doc.version + 1);
}