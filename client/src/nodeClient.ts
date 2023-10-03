import * as path from "path";
import * as vscode from "vscode";
import { format } from "prettier";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";


let client: LanguageClient;
const defaultConfigPath = "./config.rain.json";

export async function activate(context: vscode.ExtensionContext) {

    let configUri: vscode.Uri;
    let workspaceRootUri: vscode.Uri;
    const initConfig: any = {};
    const autoCompile = { onSave: [] };

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join("dist", "node", "server.js")
    );

    // get the initial settings and pass them as initialzeOptions to server
    const initSettings = vscode.workspace.getConfiguration("rainlang");

    // setting the config file and init configs
    const configPath = initSettings.config
        ? initSettings.config as string 
        : defaultConfigPath;

    for (let i = 0; i < 5; i++) {
        workspaceRootUri = getCurrentWorkspaceDir();
        if (!workspaceRootUri) await sleep(3000);
        else break;
    }
    if (workspaceRootUri) {
        try {
            configUri = vscode.Uri.joinPath(
                workspaceRootUri, 
                configPath
            );
            const content = JSON.parse(
                (await vscode.workspace.fs.readFile(configUri)).toString()
            );
            if (content?.autoCompile?.onSave?.length > 0) {
                autoCompile.onSave = content.autoCompile.onSave.map((v: any) => ({
                    source: vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.source
                    ),
                    destination: vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.destination
                    ),
                    entrypoints: v.entrypoints
                }));
            }
            if (content.meta) initConfig.meta = content.meta;
            if (content.subgraphs) initConfig.subgraphs = content.subgraphs;
        }
        catch { /**/ }
    }

    vscode.workspace.onDidChangeConfiguration(async(e) => {
        if (e.affectsConfiguration("rainlang.config")) {
            try {
                const newConfig: any = {};
                const newPath = vscode.workspace.getConfiguration("rainlang").config;
                const newConfigPath = newPath && typeof newPath === "string" 
                    ? newPath 
                    : defaultConfigPath;
                if (newConfigPath && typeof newConfigPath === "string") {
                    configUri = vscode.Uri.joinPath(
                        workspaceRootUri, 
                        newConfigPath
                    );
                    try {
                        const content = JSON.parse(
                            (await vscode.workspace.fs.readFile(configUri)).toString()
                        );
                        if (content?.autoCompile?.onSave?.length > 0) {
                            autoCompile.onSave = content.autoCompile.onSave.map((v: any) => ({
                                source: vscode.Uri.joinPath(
                                    workspaceRootUri, 
                                    v.source
                                ),
                                destination: vscode.Uri.joinPath(
                                    workspaceRootUri, 
                                    v.destination
                                ),
                                entrypoints: v.entrypoints
                            }));
                        }
                        if (content.meta) newConfig.meta = content.meta;
                        if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
                        client.sendNotification("change-rain-config", newConfig);
                    }
                    catch {
                        vscode.window.showErrorMessage(
                            "Cannot find or read the config file"
                        );
                    }
                }
            }
            catch { /**/ }
        }
    });
	
    // channel for rainlang compiler
    let rainlangCompilerChannel: vscode.OutputChannel;

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    const rainlangCompileHandler = async() => {
        const expKeys = Array.from((await vscode.window.showInputBox({
            title: "Expression Names",
            placeHolder: "binding-1 binding-2 ...",
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
        const saveConfig = autoCompile.onSave.find(v => v.source.toString() === e.uri.toString());
        if (saveConfig) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            const result = await vscode.commands.executeCommand(
                "_compile",
                e.languageId,
                e.uri.toString(),
                saveConfig.entrypoints
            );
            const contents: Uint8Array = Buffer.from(
                result 
                    ? format(JSON.stringify(result, null, 2), { parser: "json" })
                    : "\"failed to compile!\""
            );
            workspaceEdit.createFile(
                saveConfig.destination,
                { overwrite: true, contents }
            );
            vscode.workspace.applyEdit(workspaceEdit);
        }
    });

    vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.uri.toString() === configUri.toString()) {
            const newConfig: any = {};
            try {
                const content = JSON.parse(e.document.getText());
                if (content?.autoCompile?.onSave?.length > 0) {
                    autoCompile.onSave = content.autoCompile.onSave.map((v: any) => ({
                        source: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.source
                        ),
                        destination: vscode.Uri.joinPath(
                            workspaceRootUri, 
                            v.destination
                        ),
                        entrypoints: v.entrypoints
                    }));
                }
                if (content.meta) newConfig.meta = content.meta;
                if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
            }
            catch { /**/ }
            client.sendNotification("change-rain-config", newConfig);
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
            { language: "rainlang" },
            { pattern: "*.rain.json" },
            // { language: "typescript" }
        ],
        synchronize: {
            // Notify the server about file changes to ".clientrc files contained in the workspace
            fileEvents: [
                vscode.workspace.createFileSystemWatcher("**/.clientrc")
            ]
        },
        initializationOptions: initConfig
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

async function sleep(ms: number) {
    let _timeoutReference;
    return new Promise(
        resolve => _timeoutReference = setTimeout(resolve, ms)
    ).finally(
        () => clearTimeout(_timeoutReference)
    );
}