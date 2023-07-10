import * as vscode from "vscode";
import { format } from "prettier/standalone";
import { LanguageClient, LanguageClientOptions } from "vscode-languageclient/browser";


let client: LanguageClient;

// this method is called when vs code is activated
export async function activate(context: vscode.ExtensionContext) {
    
    // get the initial settings and pass them as initialzeOptions to server
    const initSettings = vscode.workspace.getConfiguration("rainlang");

    // Options to control the language client
    const clientOptions: LanguageClientOptions = {
        documentSelector: [
            { language: "rainlang" },
            { language: "javascript" },
            { language: "typescript" }
        ],
        synchronize: {},
        initializationOptions: JSON.stringify(initSettings)
    };

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
            JSON.stringify(expKeys),
            {
                start: vscode.window.activeTextEditor.selection.start,
                end: vscode.window.activeTextEditor.selection.end,
            }
        );
        if (!rainlangCompilerChannel) rainlangCompilerChannel = vscode.window.createOutputChannel(
            "Rain Language Compiler", "json"
        );
        rainlangCompilerChannel.show(true);
        if (result) rainlangCompilerChannel.appendLine(format(
            JSON.stringify(result, null, 4), 
            { parser: "json" }
        ));
        else rainlangCompilerChannel.appendLine("undefined");
    };

    // // register the command
    context.subscriptions.push(vscode.commands.registerCommand(
        "rainlang.compile", 
        rainlangCompileHandler
    ));

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        const autoCompileSetting = vscode.workspace.getConfiguration("rainlang.autoCompile");
        if (Array.isArray(autoCompileSetting.onSave) && autoCompileSetting.onSave.length) {
            const workspaceRootUri = getCurrentWorkspaceDir();
            if (workspaceRootUri) {
                const filesToCompile: {
                    dotrain: vscode.Uri,
                    json: vscode.Uri,
                    expressions: string[]
                }[] = autoCompileSetting?.onSave?.map((v: any) => {
                    try {
                        const dotrain = vscode.Uri.joinPath(workspaceRootUri, v.dotrain);
                        const json = vscode.Uri.joinPath(workspaceRootUri, v.json);
                        if (dotrain && json) return { dotrain, json, expressions: v.expressions };
                        else return undefined;
                    }
                    catch { return undefined; }
                })?.filter(v => v !== undefined && v.dotrain.toString() === e.uri.toString()) ?? [];

                if (filesToCompile.length) {
                    const workspaceEdit = new vscode.WorkspaceEdit();
                    for (let i = 0; i < filesToCompile.length; i++) {
                        const result = await vscode.commands.executeCommand(
                            "_compile",
                            e.languageId,
                            e.uri.toString(),
                            JSON.stringify(filesToCompile[i].expressions)
                        );
                        const contents: Uint8Array = Buffer.from(
                            format(
                                JSON.stringify(result, null, 4),
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
    });

    // Create a worker. The worker main file implements the language server.
    const serverMain = vscode.Uri.joinPath(context.extensionUri, "dist/browser/server.js");
    const worker = new Worker(serverMain.toString(true));

    // create the language server client to communicate with the server running in the worker
    const client = new LanguageClient(
        "rainlang", 
        "Rain Language", 
        clientOptions, 
        worker
    );

    await client.start();
}

export function deactivate(): Thenable<void> | undefined {
    if (!client) return undefined;
    return client.stop();
}

function getCurrentWorkspaceDir(): vscode.Uri | undefined {
    const currentWorkspaceEditor = vscode.window.activeTextEditor?.document.uri;
    return vscode.workspace.getWorkspaceFolder(currentWorkspaceEditor)?.uri;
}