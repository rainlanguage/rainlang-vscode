import { embeddedRainlang, getOpMeta, isInRange } from './utils';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { ErrorCode, RainDocument, RDNode } from '@rainprotocol/rainlang';
import {
	createConnection,
	TextDocuments,
	Diagnostic,
	DiagnosticSeverity,
	ProposedFeatures,
	InitializeParams,
	DidChangeConfigurationNotification,
	CompletionItem,
	CompletionItemKind,
	TextDocumentSyncKind,
	InitializeResult,
	CompletionParams,
	HoverParams,
	Range,
	Hover,
	ExecuteCommandParams
} from 'vscode-languageserver/node';


// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

const rainDocuments: Map<string, RainDocument> = new Map();
const inlineRainDocuments: Map<
	string, 
	{ rainDocument: RainDocument, range: Range, hasLiteralTemplate: boolean }[]
> = new Map();

let opmeta = "";
let hasWorkspaceFolderCapability = false;

connection.onInitialize(async(params: InitializeParams) => {
	const capabilities = params.capabilities;
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);

	// assign op meta at initialization
	if (params.initializationOptions?.opmeta) {
		opmeta = typeof params.initializationOptions.opmeta === "string"
			? params.initializationOptions.opmeta
			: await getOpMeta(params.initializationOptions.opmeta);
	}

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			completionProvider: {
				resolveProvider: true
			},
			hoverProvider: true,
			executeCommandProvider: {
				commands: ["_compile"]
			}
		}
	};
	if (hasWorkspaceFolderCapability) {
		result.capabilities.workspace = {
			workspaceFolders: {
				supported: true
			}
		};
	}
	return result;
});

connection.onInitialized(() => {
	connection.client.register(DidChangeConfigurationNotification.type, undefined);
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// executes rain compile command
connection.onExecuteCommand((e: ExecuteCommandParams) => {
	if (e.command === "_compile") {
		const langId = e.arguments![0];
		const uri = e.arguments![1];
		const range = e.arguments![2];
		if (langId === "rainlang") {
			const _rainDoc = rainDocuments.get(uri);
			if (_rainDoc) return _rainDoc.getExpressionConfig();
			else return null;
		}
		else {
			const _inline = inlineRainDocuments.get(uri);
			if (_inline) {
				for (let i = 0; i < _inline.length; i++) {
					if (
						isInRange(_inline[i].range, range.start) && 
						isInRange(_inline[i].range, range.end)
					) {
						if (!_inline[i].hasLiteralTemplate) 
							return _inline[i].rainDocument.getExpressionConfig();
						else return null;
					}
				}
				return null;
			}
			return null;
		}
	}
});

// gets the rainlang settings
async function getSetting() {
	return await connection.workspace.getConfiguration({
		section: 'rainlang'
	});
}

connection.onDidChangeConfiguration(async() => {
	const settings = await getSetting();
	if (settings?.opmeta) {
		opmeta = typeof settings.opmeta === "string"
			? settings.opmeta
			: await getOpMeta(settings.opmeta);
	}
	else opmeta = "";
	rainDocuments.clear();
	inlineRainDocuments.clear();
	documents.all().forEach(v => {
		if (v.languageId === "rainlang") {
			const _rainDoc = new RainDocument(v, opmeta);
			rainDocuments.set(v.uri, _rainDoc);
			doValidate(_rainDoc);
		}
		else {
			const _embeded = embeddedRainlang(v, opmeta);
			if (_embeded) {
				inlineRainDocuments.set(v.uri, _embeded);
				// for (let i = 0; i < _embeded.length; i++) {
				// 	doValidate(_embeded[i].rainDocument, v.uri);
				// }
			}
		}
	});
});

documents.onDidOpen(v => {
	if (v.document.languageId === "rainlang") {
		const _rainDoc = new RainDocument(v.document, opmeta);
		rainDocuments.set(v.document.uri, _rainDoc);
		doValidate(_rainDoc);
	}
	else {
		const _embeded = embeddedRainlang(v.document, opmeta);
		if (_embeded) {
			inlineRainDocuments.set(v.document.uri, _embeded);
			// for (let i = 0; i < _embeded.length; i++) {
			// 	doValidate(_embeded[i].rainDocument, v.document.uri);
			// }
		}
	}
});

documents.onDidClose(v => {
	if (v.document.languageId === "rainlang") {
		rainDocuments.delete(v.document.uri);
	}
	else {
		inlineRainDocuments.delete(v.document.uri);
	}
	connection.sendDiagnostics({ uri: v.document.uri, diagnostics: []});
});

documents.onDidChangeContent(change => {
	if (change.document.languageId === "rainlang") {
		const _rainDoc = rainDocuments.get(change.document.uri);
		if (_rainDoc) {
			_rainDoc.update(change.document);
			doValidate(_rainDoc);
		}
		else {
			const _rainDoc = new RainDocument(change.document, opmeta);
			rainDocuments.set(change.document.uri, _rainDoc);
			doValidate(_rainDoc);
		}
	}
	else {
		inlineRainDocuments.delete(change.document.uri);
		const _embeded = embeddedRainlang(change.document, opmeta);
		if (_embeded) {
			inlineRainDocuments.set(change.document.uri, _embeded);
			// for (let i = 0; i < _embeded.length; i++) {
			// 	doValidate(_embeded[i].rainDocument, change.document.uri);
			// }
		}
	}
});

async function doValidate(rainDocument: RainDocument, uri?: string): Promise<void> {
	const _td = rainDocument.getTextDocument();
	const diagnostics: Diagnostic[] = [];
	rainDocument.getProblems().forEach(
		v => {
			if (!v.msg.includes("${") && v.code !== 0x101) {
				diagnostics.push(Diagnostic.create(
					Range.create(
						_td.positionAt(v.position[0]),
						_td.positionAt(v.position[1] + 1)
					),
					ErrorCode[v.code],
					DiagnosticSeverity.Error,
					v.code,
					"rainlang",
					[
						{
							location: {
								uri: _td.uri,
								range: Range.create(
									_td.positionAt(v.position[0]),
									_td.positionAt(v.position[1] + 1)
								)
							},
							message: v.msg
						}
					]
				));
			}
		}
	);

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: uri ? uri : _td.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

connection.onCompletion(
	(params: CompletionParams): CompletionItem[] => {
		let _rd: RainDocument | undefined;
		if (
			params.textDocument.uri.endsWith(".rain") ||
			params.textDocument.uri.endsWith(".rainlang") ||
			params.textDocument.uri.endsWith(".rl")
		) {
			_rd = rainDocuments.get(params.textDocument.uri);
		}
		else {
			const _inline = inlineRainDocuments.get(params.textDocument.uri);
			if (_inline) {
				for (let i = 0; i < _inline.length; i++) {
					if (isInRange(_inline[i].range, params.position)) {
						_rd = _inline[i].rainDocument;
						break;
					}
				}
			}
		}
		if (_rd) {
			const _td = _rd?.getTextDocument();
			const _offset = _td.offsetAt(params.position);
			const _result: CompletionItem[] = _rd.getOpMeta().map(v => {
				return {
					label: v.name,
					kind: CompletionItemKind.Function,
					detail: "opcode " + v.name + (
						v.operand === 0 
							? "()" 
							: v.operand.find(i => i.name !== "inputs") 
								? "<>()" 
								: "()"
					),
					documentation: {
						kind: "markdown",
						value: v.desc
					},
					insertText: v.name + (
						v.operand === 0 
							? "()" 
							: v.operand.find(i => i.name !== "inputs") 
								? "<>()" 
								: "()"
					)
				} as CompletionItem;
			});
			_rd.getOpMeta().forEach(v => {
				v.aliases?.forEach(e =>
					_result.push({
						label: e,
						kind: CompletionItemKind.Function,
						detail: "opcode " + e + (
							v.operand === 0 
								? "()" 
								: v.operand.find(i => i.name !== "inputs") 
									? "<>()" 
									: "()"
						),
						documentation: {
							kind: "markdown",
							value: v.desc
						},
						insertText: v.name + (
							v.operand === 0 
								? "()" 
								: v.operand.find(i => i.name !== "inputs") 
									? "<>()" 
									: "()"
						)
					} as CompletionItem)
				);
			});
			const _tree = _rd.getParseTree();
			let _currentSource = 0;
			for (let i = 0; i < _tree.length; i++) {
				if (_tree[i].position[0] <= _offset && _tree[i].position[1] >= _offset) {
					_currentSource = i;
					break;
				}
			}
			let _pos: [number, number] | undefined;
			_rd.getLHSAliases()[_currentSource]?.forEach(v => {
				let _text = "";
				_pos = _tree[_currentSource].tree.find(e => {
					if (e.lhs) {
						if (Array.isArray(e.lhs)) {
							if (e.lhs.find(i => i.name === v.name)) return true;
							else return false;
						}
						else {
							if (e.lhs.name === v.name) return true;
							else return false;
						}
					}
					else return false;
				})?.position;
				if (_pos) _text = `${_rd!.getTextDocument()
					.getText()
					.slice(_pos[0], _pos[1] + 1)}`;
				_result.unshift({
					label: v.name,
					kind: CompletionItemKind.Variable,
					detail: v.name === "_" ? "placeholder _" : v.name,
					documentation: {
						kind: "markdown",
						value: [
							`LHS Alias to `,
							"```rainlang",
							_text,
							"```"
						].join("\n")
					}
				});
			});
			return _result;
		}
		else return [];
	}
);

connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		return item;
	}
);

connection.onHover(
	(params: HoverParams): Hover | null => {
		let _rd: RainDocument | undefined;
		if (
			params.textDocument.uri.endsWith(".rain") ||
			params.textDocument.uri.endsWith(".rainlang") ||
			params.textDocument.uri.endsWith(".rl")
		) {
			_rd = rainDocuments.get(params.textDocument.uri);
		}
		// else {
		// 	const _inline = inlineRainDocuments.get(params.textDocument.uri);
		// 	if (_inline) {
		// 		for (let i = 0; i < _inline.length; i++) {
		// 			if (isInRange(_inline[i].range, params.position)) {
		// 				_rd = _inline[i].rainDocument;
		// 				break;
		// 			}
		// 		}
		// 	}
		// }
		if (_rd) {
			const _td = _rd.getTextDocument();
			const _offset = _td.offsetAt(params.position);
			const _tree = _rd.getParseTree().find(v =>
				v.position[0] <= _offset && v.position[1] >= _offset
			);
			const search = (node: RDNode[]): Hover | null => {
				for (let i = 0; i < node.length; i++) {
					const _n = node[i];
					if (_n.position[0] <= _offset && _n.position[1] >= _offset) {
						if ("opcode" in _n) {
							if (_n.parens[0] < _offset && _n.parens[1] > _offset) {
								return search(_n.parameters);
							}
							else return {
								contents: {
									kind: "markdown",
									value: _n.opcode.description
								}
							} as Hover;
						}
						else if ("value" in _n) {
							return {
								contents: {
									kind: "markdown",
									value: "Value"
								}
							} as Hover;
						}
						else return {
							contents: {
								kind: "markdown",
								value: [
									"LHS Alias",
									"```rainlang",
									_td.getText(
										Range.create(
											_td.positionAt(_n.position[0]), 
											_td.positionAt(_n.position[1] + 1)
										)
									),
									"```"
								].join("\n")
							},
							range: Range.create(_td.positionAt(4), _td.positionAt(12))
						} as Hover;
					}
					else if (_n.lhs) {
						let _lhs = _n.lhs;
						if (!Array.isArray(_lhs)) _lhs = [_lhs];
						for (let j = 0; j < _lhs.length; j++) {
							if (_lhs[j].position[0] <= _offset && _lhs[j].position[1] >= _offset) {
								return {
									contents: {
										kind: "markdown",
										value: "opcode" in _n 
											? [
												"Alias for", 
												"```rainlang",
												_td.getText(
													Range.create(
														_td.positionAt(_n.position[0]),
														_td.positionAt(_n.position[1] + 1)
													)
												),
												"```"
											].join("\n")
											: "value" in _n
												? [
													"Alias for value",
													"```rainlang",
													_n.value,
													"```"
												].join("\n")
												: [
													"Alias for alias",
													"```rainlang",
													_n.name,
													"```"
												].join("\n")
									}
								} as Hover;
							}
						}
					}
				}
				return null;
			};
			if (_tree) return search(_tree.tree);
			else return null;
		}
		else return null;
	}
);

// Make the text document manager listen on the connection
// for open, change and close text document events
documents.listen(connection);

// Listen on the connection
connection.listen();
