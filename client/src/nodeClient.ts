import * as path from "path";
import * as vscode from "vscode";
import { format } from "prettier";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";


let client: LanguageClient;
const defaultConfigPath = "./config.rain.json";

export async function activate(context: vscode.ExtensionContext) {

    // config file URI
    let configUri: vscode.Uri;

    // workspace root URI
    let workspaceRootUri: vscode.Uri;

    // directories to check for rain documents, default is "src"
    let dirs: vscode.Uri[] = [];

    // auto compile mappings
    const compile = { onSave: [] };

    // channel for rainlang compiler
    let rainlangCompilerChannel: vscode.OutputChannel;

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join("dist", "node", "server.js")
    );

    // get the initial settings and pass them as initialzeOptions to server
    const initSettings = vscode.workspace.getConfiguration("rainlang");

    // setting the config file at startup
    const configPath = initSettings.config
        ? initSettings.config as string 
        : defaultConfigPath;

    // setup the config file on config change
    vscode.workspace.onDidChangeConfiguration(async e => {
        if (e.affectsConfiguration("rainlang.config")) {
            try {
                const newPath = vscode.workspace.getConfiguration("rainlang").config;
                const newConfigPath = newPath && typeof newPath === "string" 
                    ? newPath 
                    : defaultConfigPath;
                configUri = vscode.Uri.joinPath(
                    workspaceRootUri, 
                    newConfigPath
                );
                const content = JSON.parse(
                    (await vscode.workspace.fs.readFile(configUri)).toString()
                );
                processConfig(content);
            }
            catch {
                dirs = [];
                compile.onSave = [];
                vscode.window.showErrorMessage(
                    "Cannot find or read the config file"
                );
            }
        }
    });

    // auto compile on save implementation
    vscode.workspace.onDidSaveTextDocument(async e => {
        if (e.uri.toString() === configUri.toString()) {
            try {
                const content = JSON.parse(e.getText());
                processConfig(content);
            }
            catch { 
                dirs = [];
                compile.onSave = [];
            }
        }
        const saveMap = compile.onSave.find(v => v.input.toString() === e.uri.toString());
        if (saveMap) {
            const workspaceEdit = new vscode.WorkspaceEdit();
            const result = await vscode.commands.executeCommand(
                "_compile",
                e.languageId,
                e.uri.toString(),
                saveMap.entrypoints
            );
            const contents: Uint8Array = Buffer.from(
                result 
                    ? format(JSON.stringify(result, null, 2), { parser: "json" })
                    : "\"failed to compile!\""
            );
            workspaceEdit.createFile(
                saveMap.output,
                { overwrite: true, contents }
            );
            vscode.workspace.applyEdit(workspaceEdit);
        }
    });

    vscode.workspace.onDidCreateFiles(created => {
        created.files.forEach(async e => {
            if (e.toString() === configUri.toString()) {
                try {
                    const content = JSON.parse(
                        (await vscode.workspace.fs.readFile(configUri)).toString()
                    );
                    processConfig(content);
                }
                catch {
                    dirs = [];
                    compile.onSave = [];
                }
            }
        });
    });

    vscode.workspace.onDidDeleteFiles(deleted => {
        deleted.files.forEach(e => {
            if (e.toString() === configUri.toString()) {
                dirs = [];
                compile.onSave = [];
            }
        });
    });

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
            { pattern: "*.rain.json", language: "json" }
        ],
        synchronize: {
            // Notify the server about file changes to ".clientrc files contained in the workspace
            // fileEvents: [
            //     vscode.workspace.createFileSystemWatcher("**/.clientrc")
            // ]
        },
        // initializationOptions: initConfig
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

    // set the workspace root URI on startup
    client.onNotification("request-config", async e => {
        if (e !== null) {
            workspaceRootUri = vscode.Uri.parse(e);
            // wait for server to fully start
            // await sleep(6000);
            try {
                configUri = vscode.Uri.joinPath(
                    workspaceRootUri, 
                    configPath
                );
                const content = JSON.parse(
                    (await vscode.workspace.fs.readFile(configUri)).toString()
                );
                processConfig(content);
            }
            catch {
                dirs = [];
                compile.onSave = [];
            }
        }
    });

    function processConfig(content: any) {
        try {
            const newConfig: any = {};
            if (content?.compile?.onSave?.length > 0) {
                compile.onSave = content.compile.onSave.map((v: any) => ({
                    input: vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.input
                    ),
                    output: vscode.Uri.joinPath(
                        workspaceRootUri, 
                        v.output
                    ),
                    entrypoints: v.entrypoints
                }));
            }
            if (content.meta) newConfig.meta = content.meta;
            if (content.subgraphs) newConfig.subgraphs = content.subgraphs;
            client.sendNotification("update-config", newConfig);

            // find .rains on startup and send them to server for storing in meta store
            const newDirs: vscode.Uri[] = [];
            if (content.dirs && Array.isArray(content.dirs) && content.dirs.length > 0) {
                for (let i = 0; i < content.dirs.length; i++) {
                    const dir = vscode.Uri.joinPath(workspaceRootUri, content.dirs[i]);
                    newDirs.push(dir);
                    if (!dirs.find(v => v.toString() === dir.toString())) {
                        vscode.workspace.findFiles(
                            new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                            "**​/node_modules/**"
                        ).then(
                            v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                            () => { /**/ }
                        );
                    }
                }
            }
            else {
                const dir = vscode.Uri.joinPath(workspaceRootUri, "./src");
                newDirs.push(dir);
                if (!dirs.find(v => v.toString() === dir.toString())) {
                    vscode.workspace.findFiles(
                        new vscode.RelativePattern(newDirs[newDirs.length - 1], "**/*.rain"), 
                        "**​/node_modules/**"
                    ).then(
                        v => v.forEach(doc => vscode.workspace.openTextDocument(doc)),
                        () => { /**/ }
                    );
                }
            }
            dirs = newDirs;
        }
        catch {
            dirs = [];
            compile.onSave = [];
        }
    }
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
    let _to;
    return new Promise(
        resolve => _to = setTimeout(resolve, ms)
    ).finally(
        () => clearTimeout(_to)
    );
}
