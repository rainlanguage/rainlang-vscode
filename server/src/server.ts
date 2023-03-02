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
	TextDocumentPositionParams,
	TextDocumentSyncKind,
	InitializeResult,
	CompletionParams,
	HoverParams,
	Position,
	CompletionOptions,
	Range,
	DidChangeConfigurationParams,
	Hover
} from 'vscode-languageserver/node';
import {
	TextDocument
} from 'vscode-languageserver-textdocument';
import { ErrorCode, RainDocument, RDNode } from '@rainprotocol/rainlang';

// Create a connection for the server, using Node's IPC as a transport.
// Also include all preview / proposed LSP features.
const connection = createConnection(ProposedFeatures.all);

// Create a simple text document manager.
const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);
const rainDocuments: Map<string, RainDocument> = new Map();

let opmeta = "";
let hasConfigurationCapability = false;
let hasWorkspaceFolderCapability = false;
let hasDiagnosticRelatedInformationCapability = false;

connection.onInitialize((params: InitializeParams) => {
	const capabilities = params.capabilities;
	// Does the client support the `workspace/configuration` request?
	// If not, we fall back using global settings.
	hasConfigurationCapability = !!(
		capabilities.workspace && !!capabilities.workspace.configuration
	);
	hasWorkspaceFolderCapability = !!(
		capabilities.workspace && !!capabilities.workspace.workspaceFolders
	);
	hasDiagnosticRelatedInformationCapability = !!(
		capabilities.textDocument &&
		capabilities.textDocument.publishDiagnostics &&
		capabilities.textDocument.publishDiagnostics.relatedInformation
	);

	const result: InitializeResult = {
		capabilities: {
			textDocumentSync: TextDocumentSyncKind.Incremental,
			// Tell the client that this server supports code completion.
			completionProvider: {
				resolveProvider: true
			},
			hoverProvider: true
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
	if (hasConfigurationCapability) {
		// Register for all configuration changes.
		// opmeta = (await connection.workspace.getConfiguration({
		// 	section: "rainlang"
		// })).opmeta ?? "";
		connection.client.register(DidChangeConfigurationNotification.type, undefined);
	}
	if (hasWorkspaceFolderCapability) {
		connection.workspace.onDidChangeWorkspaceFolders(_event => {
			connection.console.log('Workspace folder change event received.');
		});
	}
});

// // The example settings
// interface Settings {
// 	opmeta: string;
// }

// The global settings, used when the `workspace/configuration` request is not supported by the client.
// Please note that this is not the case when using this server with the client provided in this example
// but could happen with other clients.
// const defaultSettings: Settings = { opmeta: "" };
// let globalSettings: Settings = defaultSettings;

// Cache the settings of all open documents
// const documentSettings: Map<string, Thenable<Settings>> = new Map();

connection.onDidChangeConfiguration(async(change) => {
	// if (hasConfigurationCapability) {
	// 	// Reset all cached document settings
	// 	documentSettings.clear();
	// } else {
	// 	globalSettings = <Settings>(
	// 		(change.settings.rainlang.opmeta || defaultSettings)
	// 	);
	// 
	const settings = await getDocumentSettings();
	if (settings) {
		opmeta = settings.opmeta;
		// Revalidate all open text documents
		rainDocuments.clear();
		documents.all().forEach(v => {
			const _rainDoc = new RainDocument(v, opmeta);
			rainDocuments.set(v.uri, _rainDoc);
			doValidate(_rainDoc);
		});
	}
});

function getDocumentSettings(): Thenable<any> {
	if (!hasConfigurationCapability) {
		return Promise.resolve("");
	}
	let result;
	if (!result) {
		result = connection.workspace.getConfiguration({
			section: 'rainlang'
		});
	}
	return result;
}

// instantiate rain document for every open document
documents.onDidOpen(async (e) => {
	if (opmeta === "") {
		opmeta = (await getDocumentSettings()).opmeta ?? "";
	}
	rainDocuments.set(e.document.uri, new RainDocument(e.document, opmeta));
});

// Only keep rain documents instances for open documents
documents.onDidClose(e => {
	rainDocuments.delete(e.document.uri);
});

// The content of a text document has changed. This event is emitted
// when the text document first opened or when its content has changed.
documents.onDidChangeContent(async (change) => {
	if (opmeta === "") {
		opmeta = (await getDocumentSettings()).opmeta ?? "";
	}
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
});

async function doValidate(rainDocument: RainDocument): Promise<void> {
	const _td = rainDocument.getTextDocument();
	const diagnostics: Diagnostic[] = rainDocument.getProblems().map(
		v => Diagnostic.create(
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
		)
	);

	// Send the computed diagnostics to VSCode.
	connection.sendDiagnostics({ uri: _td.uri, diagnostics });
}

connection.onDidChangeWatchedFiles(_change => {
	// Monitored files have change in VSCode
	connection.console.log('We received an file change event');
});

// This handler provides the initial list of the completion items.
connection.onCompletion(
	(params: CompletionParams): CompletionItem[] => {
		const _rd = rainDocuments.get(params.textDocument.uri);
		if (_rd) {
			const _td = _rd?.getTextDocument();
			const _offset = _td.offsetAt(params.position);
			const _result = _rd.getOpMeta().map(v => {
				return {
					label: v.name,
					kind: CompletionItemKind.Function,
					detail: "opcode " + v.name + (v.operand === 0 ? "()" : "<>()"),
					documentation: {
						kind: "markdown",
						value: v.desc
					}
				} as CompletionItem;
			});
			_rd.getOpMeta().forEach(v => {
				v.aliases?.forEach(e =>
					_result.push({
						label: e,
						kind: CompletionItemKind.Function,
						detail: "opcode " + e + (v.operand === 0 ? "()" : "<>()"),
						documentation: {
							kind: "markdown",
							value: v.desc
						}
					})
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
				if (_pos) _text = " to " + `"${_rd.getTextDocument()
					.getText()
					.slice(_pos[0], _pos[1] + 1)}"`;
				_result.unshift({
					label: v.name,
					kind: CompletionItemKind.Variable,
					detail: v.name,
					documentation: {
						kind: "markdown",
						value: `LHS Alias${_text}`
					}
				});
			});
			return _result;
		}
		else return [];
	}
);

// This handler resolves additional information for the item selected in
// the completion list.
connection.onCompletionResolve(
	(item: CompletionItem): CompletionItem => {
		return item;
	}
);

// This handler provides hover information
connection.onHover(
	(params: HoverParams): Hover | null => {
		const _rd = rainDocuments.get(params.textDocument.uri);
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
								value: "LHS Alias"
							}
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
										value: "opcode" in _n ?
											"Alias for opcode " + _n.opcode.name
											: "value" in _n
												? "Alias for value " + _n.value
												: "Alias for alias " + _n.name
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
