import * as path from "path";
import * as vscode from "vscode";
import { format } from "prettier";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";


let client: LanguageClient;

export async function activate(context: vscode.ExtensionContext) {

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join("dist", "node", "server.js")
    );

    // get the initial settings and pass them as initialzeOptions to server
    const initSettings = vscode.workspace.getConfiguration("rainlang");
	
    // channel for rainlang compiler
    let rainlangCompilerChannel: vscode.OutputChannel;

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    const rainlangCompileHandler = async() => {
        const expKeys = Array.from((await vscode.window.showInputBox({
            title: "Expression Names",
            placeHolder: "exp-1 exp-2 ...",
            prompt: "specify the expression names in order by a whitespace seperating them"
        })).matchAll(/[^\s]+/g)).map(v => v[0]);
        const result = await vscode.commands.executeCommand(
            "_compile",
            vscode.window.activeTextEditor.document.languageId,
            vscode.window.activeTextEditor.document.uri.toString(),
            expKeys,
            {
                start: vscode.window.activeTextEditor.selection.start,
                end: vscode.window.activeTextEditor.selection.end,
            }
        );
        if (!rainlangCompilerChannel) rainlangCompilerChannel = vscode.window.createOutputChannel(
            "Rain Language Compiler",
            "json"
        );
        rainlangCompilerChannel.show(true);
        if (result) rainlangCompilerChannel.appendLine(format(
            JSON.stringify(result, null, 2), 
            { parser: "json" }
        ));
        else rainlangCompilerChannel.appendLine("undefined");
    };

    // register the command
    context.subscriptions.push(
        vscode.commands.registerCommand("rainlang.compile", rainlangCompileHandler)
    );

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        const autoCompile = vscode.workspace.getConfiguration("rainlang.autoCompile");
        if (typeof autoCompile.onSave === "string" && autoCompile.onSave) {
            const workspaceRootUri = getCurrentWorkspaceDir();
            if (workspaceRootUri) {
                const mappingFileUri = vscode.Uri.joinPath(workspaceRootUri, autoCompile.onSave);
                try {
                    const content = JSON.parse(
                        (await vscode.workspace.fs.readFile(mappingFileUri)).toString()
                    );
                    if (Array.isArray(content) && content.length) {
                        const EXP_PATTERN = /^[a-z][0-9a-z-]*$/;
                        const JSON_PATH_PATTERN = /^(\.\/)(\.\/|\.\.\/|[^]*\/)*[^]+\.json$/;
                        const DOTRAIN_PATH_PATTERN = /^(\.\/)(\.\/|\.\.\/|[^]*\/)*[^]+\.rain$/;
                        const filesToCompile: {
                            dotrain: vscode.Uri,
                            json: vscode.Uri,
                            expressions: string[]
                        }[] = content?.map((v: any) => {
                            if (
                                typeof v.dotrain === "string"
                                && v.dotrain
                                && DOTRAIN_PATH_PATTERN.test(v.dotrain)
                                && typeof v.json === "string"
                                && v.json
                                && JSON_PATH_PATTERN.test(v.json)
                                && Array.isArray(v.expressions)
                                && v.expressions.length
                                && v.expressions.every((name: any) => 
                                    typeof name === "string"
                                    && name
                                    && EXP_PATTERN.test(name)
                                )
                            ) {
                                try {
                                    const dotrain = vscode.Uri.joinPath(
                                        workspaceRootUri,
                                        v.dotrain
                                    );
                                    const json = vscode.Uri.joinPath(
                                        workspaceRootUri,
                                        v.json
                                    );

                                    if (dotrain && json) {
                                        return { 
                                            dotrain, 
                                            json, 
                                            expressions: v.expressions 
                                        };
                                    }
                                    else return undefined;
                                }
                                catch { return undefined; }
                            }
                            else return undefined;
                        })?.filter(v => 
                            v !== undefined && v.dotrain.toString() === e.uri.toString()
                        ) ?? [];
        
                        if (filesToCompile.length) {
                            const workspaceEdit = new vscode.WorkspaceEdit();
                            for (let i = 0; i < filesToCompile.length; i++) {
                                const result = await vscode.commands.executeCommand(
                                    "_compile",
                                    e.languageId,
                                    e.uri.toString(),
                                    filesToCompile[i].expressions
                                );
                                const contents: Uint8Array = Buffer.from(
                                    format(
                                        result 
                                            ? JSON.stringify(result, null, 2) 
                                            : "failed to compile!",
                                        { parser: "json" }
                                    )
                                );
                                workspaceEdit.createFile(
                                    filesToCompile[i].json,
                                    { overwrite: true, contents }
                                );
                            }
                            vscode.workspace.applyEdit(workspaceEdit);
                        }
                    }
                }
                catch (error) {
                    vscode.window.showErrorMessage(
                        "Failed to find mapping file or parse its contents"
                    );
                }
            }
        }
    });

    // If the extension is launched in debug mode then the debug server options are used
    // Otherwise the run options are used
    const serverOptions: ServerOptions = {
        run: { module: serverModule, transport: TransportKind.ipc },
        debug: {
            module: serverModule,
            transport: TransportKind.ipc,
        }
    };

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { scheme: "file", language: "rainlang" },
            { language: "javascript" },
            { language: "typescript" }
        ],
        synchronize: {
            // Notify the server about file changes to ".clientrc files contained in the workspace
            fileEvents: [
                // workspace.createFileSystemWatcher("**/*.rain"),
                vscode.workspace.createFileSystemWatcher("**/.clientrc")
            ]
        },
        initializationOptions: initSettings
    };

    // const myProvider = new (class implements vscode.InlayHintsProvider {
    // 	provideInlayHints(
    // 		document: vscode.TextDocument, 
    // 		range: vscode.Range
    // 	): vscode.ProviderResult<vscode.InlayHint[]> {
    // 		return [new vscode.InlayHint(new vscode.Position(0, 0), "hello")];
    // 	}
    // });
    // context.subscriptions.push(
    // 	vscode.languages.registerInlayHintsProvider(
    // 		[{language: "rainlang"}, {language: "javascript"}], 
    // 		myProvider
    // 	)
    // );
    // vscode.window.onDidChangeActiveTextEditor(e => {
    // 	console.log(e.document.getText());
    // });

    // Create the language client and start the client.
    client = new LanguageClient(
        "rainlang",
        "Rain Language",
        serverOptions,
        clientOptions
    );

    // Start the client. This will also launch the server
    await client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}

function getCurrentWorkspaceDir(): vscode.Uri | undefined {
    const currentWorkspaceEditor = vscode.window.activeTextEditor?.document.uri;
    return currentWorkspaceEditor 
        ? vscode.workspace.getWorkspaceFolder(currentWorkspaceEditor)?.uri 
        : undefined;
}