import * as path from "path";
import * as vscode from "vscode";
import { format } from "prettier";
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind } from "vscode-languageclient/node";


let client: LanguageClient;
const defaultConfigPath1 = "./rainconfig.json";
const defaultConfigPath2 = "./.rainconfig.json";

export async function activate(context: vscode.ExtensionContext) {

    // status of the client/server
    const extStatus = { onsave: true, active: true };

    // disposables to free at server stop
    let disposables: vscode.Disposable[] = [];

    // default config uri set at the fisrt start of the server
    let defaultConfigUri: vscode.Uri;

    // config file URI
    let configUri: vscode.Uri;

    // workspace root URI
    let workspaceRootUri: vscode.Uri;

    // directories to check for rain documents, default is "src"
    let watched: vscode.Uri[] = [];

    // // auto compile mappings
    // const compile = { onSave: [] };

    // channel for rainlang compiler
    let compilerChannel: vscode.OutputChannel;

    // The server is implemented in node
    const serverModule = context.asAbsolutePath(
        path.join("dist", "node", "server.js")
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
            { pattern: "*rainconfig.json", language: "json" }
        ],
        synchronize: {
            // Notify the server about file changes to ".clientrc files contained in the workspace
            // fileEvents: [
            //     vscode.workspace.createFileSystemWatcher("**/.clientrc")
            // ]
        },
        // initializationOptions: initConfig
    };

    // get the initial settings and pass them as initialzeOptions to server
    // const initSettings = vscode.workspace.getConfiguration("rainlang");

    // setting the config file at startup
    // const configPath = initSettings.config
    //     ? initSettings.config as string 
    //     : defaultConfigPath;

    // const configPath = defaultConfigPath;

    // // setup the config file on config change
    // vscode.workspace.onDidChangeConfiguration(async e => {
    //     if (e.affectsConfiguration("rainlang.config")) {
    //         try {
    //             if (workspaceRootUri) {
    //                 const newPath = vscode.workspace.getConfiguration("rainlang").config;
    //                 const newConfigPath = newPath && typeof newPath === "string" 
    //                     ? newPath 
    //                     : defaultConfigPath;
    //                 configUri = vscode.Uri.joinPath(workspaceRootUri, newConfigPath);
    //                 const content = JSON.parse(
    //                     (await vscode.workspace.fs.readFile(configUri)).toString()
    //                 );
    //                 processConfig(content);
    //             }
    //         }
    //         catch {
    //             watched = [];
    //             compile.onSave = [];
    //             vscode.window.showErrorMessage(
    //                 "Cannot find or read the config file"
    //             );
    //         }
    //     }
    // });

    // setup the statusbar
    const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);
    statusBar.text = "rainlang-ext";
    updateStatus();

    // add subscriptions
    context.subscriptions.push(
        statusBar,
        vscode.commands.registerCommand("rainlang.start", start),
        vscode.commands.registerCommand("rainlang.stop", stop),
        vscode.commands.registerCommand("rainlang.restart", restart),
        // vscode.commands.registerCommand("rainlang.onsave", updateOnSaveCompile),
        vscode.commands.registerCommand("rainlang.compile", compileCurrentHandler),
        // vscode.commands.registerCommand("rainlang.compile.all", compileAllHandler)
    );
    
    function updateStatus() {
        statusBar.hide();
        if (extStatus.active) {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (running)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown([
                "\n\n[Stop Server](command:rainlang.stop)",
                "\n\n[Restart Server](command:rainlang.restart)",
                // "\n\n---\n\n",
                // "\n\n[Compile](command:rainlang.compile.all)",
            ].join(""));
            // if (extStatus.onsave) statusBar.tooltip.appendMarkdown(
            //     "\n\n[Turn Off Compile-On-Save](command:rainlang.onsave)",
            // );
            // else statusBar.tooltip.appendMarkdown(
            //     "\n\n[Turn On Compile-On-Save](command:rainlang.onsave)",
            // );
        }
        else {
            statusBar.tooltip = new vscode.MarkdownString("Rainlang Extension (stopped)", true);
            statusBar.tooltip.isTrusted = true;
            statusBar.tooltip.appendMarkdown("\n\n[Start Server](command:rainlang.start)");
        }
        statusBar.show();
    }

    // handler for rainlang compiler, send the request to server and logs the result in output channel
    async function compileCurrentHandler() {
        if (client && extStatus.active) {
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
                "uri"
                // {
                //     start: vscode.window.activeTextEditor.selection.start,
                //     end: vscode.window.activeTextEditor.selection.end,
                // }
            );
            if (!compilerChannel) compilerChannel = vscode.window.createOutputChannel(
                "Rain Language Compiler",
                "json"
            );
            compilerChannel.show(true);
            if (result) compilerChannel.appendLine(format(
                JSON.stringify(result, null, 2), 
                { parser: "json" }
            ));
            else compilerChannel.appendLine("undefined");
        }
        else vscode.window.showErrorMessage("rain language server is not running!");
    }

    // // handler for rainlang compiler by sending the request to server for a mapping
    // async function compileAllHandler() {
    //     if (client && extStatus.active) {
    //         const workspaceEdit = new vscode.WorkspaceEdit();
    //         for (const map of compile.onSave) {
    //             try {
    //                 const fileContent = (await vscode.workspace.fs.readFile(map.input)).toString();
    //                 const result = await vscode.commands.executeCommand(
    //                     "_compile",
    //                     "rainlang",
    //                     fileContent,
    //                     map.entrypoints,
    //                     "file"
    //                 );
    //                 const contents: Uint8Array = Buffer.from(
    //                     result 
    //                         ? format(JSON.stringify(result, null, 2), { parser: "json" })
    //                         : "\"failed to compile!\""
    //                 );
    //                 workspaceEdit.createFile(
    //                     map.output,
    //                     { overwrite: true, contents }
    //                 );
    //             }
    //             catch { /**/ }
    //         }
    //         vscode.workspace.applyEdit(workspaceEdit);
    //     }
    //     else vscode.window.showErrorMessage("rain language server is not running!");
    // }

    // function updateOnSaveCompile() {
    //     if (extStatus.onsave) extStatus.onsave = false;
    //     else extStatus.onsave = true;
    //     updateStatus();
    // }

    async function restart() {
        if (!extStatus.active) {
            vscode.window.showWarningMessage("rain language server is not running!");
        }
        else await client?.restart();
    }

    async function stop() {
        if (!extStatus.active) {
            vscode.window.showWarningMessage("rain language server is not running!");
        }
        else {
            watched = [];
            // compile.onSave = [];
            configUri = undefined;
            disposables.forEach(v => v?.dispose());
            disposables = [];
            await client.stop();
            client = undefined;
            extStatus.active = false;
            updateStatus();
        }
    }

    async function start() {
        if (extStatus.active) {
            vscode.window.showWarningMessage("rain language server is already running!");
        }
        else await _start();
    }

    async function _start() {
        // auto compile on save implementation
        disposables.push(vscode.workspace.onDidSaveTextDocument(async e => {
            try {
                if (e.uri.toString() === configUri.toString()) {
                    const content = JSON.parse(e.getText());
                    processConfig(content);
                }
            }
            catch { 
                watched = [];
                // compile.onSave = [];
            }
            // if (extStatus.onsave) {
            //     const saveMap = compile.onSave.find(v => v.input.toString() === e.uri.toString());
            //     if (saveMap) {
            //         const workspaceEdit = new vscode.WorkspaceEdit();
            //         const result = await vscode.commands.executeCommand(
            //             "_compile",
            //             e.languageId,
            //             e.uri.toString(),
            //             saveMap.entrypoints,
            //             "uri"
            //         );
            //         const contents: Uint8Array = Buffer.from(
            //             result 
            //                 ? format(JSON.stringify(result, null, 2), { parser: "json" })
            //                 : "\"failed to compile!\""
            //         );
            //         workspaceEdit.createFile(
            //             saveMap.output,
            //             { overwrite: true, contents }
            //         );
            //         vscode.workspace.applyEdit(workspaceEdit);
            //     }
            // }
        }));

        disposables.push(vscode.workspace.onDidCreateFiles(async created => {
            let didProcessConfig = false;
            if (configUri === undefined && defaultConfigUri !== undefined) {
                for (let i = 0; i < created.files.length; i++) {
                    if (created.files[i].toString() === defaultConfigUri.toString()) {
                        try {
                            configUri = defaultConfigUri;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                        catch {
                            watched = [];
                            // compile.onSave = [];
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                }
            }
            if (!didProcessConfig && configUri !== undefined) reloadWatched();
        }));

        disposables.push(vscode.workspace.onDidDeleteFiles(deleted => {
            if (configUri !== undefined) {
                for (let i = 0; i < deleted.files.length; i++) {
                    try {
                        if (deleted.files[i].toString() === configUri.toString()) {
                            watched = [];
                            // compile.onSave = [];
                            configUri = undefined;
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    catch { /**/ }
                }
            }
            if (configUri !== undefined) reloadWatched();
        }));

        disposables.push(vscode.workspace.onDidRenameFiles(async renamed => {
            let didProcessConfig = false;
            if (configUri === undefined) {
                if(defaultConfigUri !== undefined) for(let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].newUri.toString() === defaultConfigUri.toString()) {
                            configUri = defaultConfigUri;
                            const content = JSON.parse(
                                (await vscode.workspace.fs.readFile(defaultConfigUri)).toString()
                            );
                            didProcessConfig = true;
                            processConfig(content);
                            break;
                        }
                    }
                    catch { 
                        watched = [];
                        // compile.onSave = [];
                        client.sendNotification("unwatch-all");
                        break;
                    }
                }
            }
            else {
                for (let i = 0; i < renamed.files.length; i++) {
                    try {
                        if (renamed.files[i].oldUri.toString() === configUri.toString()) {
                            if(renamed.files[i].newUri.toString() ===defaultConfigUri?.toString()){
                                configUri = defaultConfigUri;
                                break;
                            }
                            watched = [];
                            // compile.onSave = [];
                            configUri = undefined;
                            client.sendNotification("unwatch-all");
                            break;
                        }
                    }
                    catch { /**/ }
                }
            }
            if (!didProcessConfig && configUri) reloadWatched();
        }));

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
        disposables.push(client.onNotification("request-config", async e => {
            if (e !== null) {
                workspaceRootUri = vscode.Uri.parse(e);
                // wait for server to fully start
                // await sleep(6000);
                try {
                    defaultConfigUri = vscode.Uri.joinPath(workspaceRootUri, defaultConfigPath1);
                    configUri = defaultConfigUri;
                    const content = JSON.parse(
                        (await vscode.workspace.fs.readFile(configUri)).toString()
                    );
                    processConfig(content);
                }
                catch {
                    watched = [];
                    // compile.onSave = [];
                }
            }
        }));
        extStatus.active = true;
        updateStatus();
    }

    // start server once
    await _start();

    // reload .rain watched files
    async function reloadWatched() {
        const promiseGroup1: any[] = [];
        const promiseGroup2: any[] = [];
        const promiseGroup3: any[] = [];
        await client.sendNotification("unwatch-all");
        for (const dir of watched) {
            promiseGroup1.push(vscode.workspace.fs.stat(dir).then(stat => {
                if (stat.type !== vscode.FileType.Directory) {
                    if (stat.type === vscode.FileType.File && dir.toString().endsWith(".rain")) {
                        promiseGroup3.push(vscode.workspace.fs.readFile(dir).then(
                            v => client.sendNotification(
                                "watch-dotrain", 
                                [dir.toString(), v.toString()]
                            ),
                            () => { /**/ }
                        ));
                    }
                }
                else promiseGroup2.push(vscode.workspace.findFiles(
                    new vscode.RelativePattern(dir, "**/*.rain"), 
                    "**​/node_modules/**"
                ).then(
                    v => v.forEach(doc => promiseGroup3.push(
                        vscode.workspace.fs.readFile(doc).then(
                            e => client.sendNotification(
                                "watch-dotrain", 
                                [doc.toString(), e.toString()]
                            ),
                            () => { /**/ }
                        )
                    )),
                    () => { /**/ }
                ));
            }));
        }
        await Promise.allSettled(promiseGroup1);
        await Promise.allSettled(promiseGroup2);
        await Promise.allSettled(promiseGroup3);
        client.sendNotification("reval-all");
    }

    // processes the configuration file contents
    async function processConfig(content: any) {
        const newWatched: vscode.Uri[] = [];
        const promiseGroup1: any[] = [];
        const promiseGroup2: any[] = [];
        const promiseGroup3: any[] = [];
        await client.sendNotification("unwatch-all");
        updateMetaStore(content, workspaceRootUri);
        // if (
        //     content?.src?.length > 0 && 
        //     Array.isArray(content.src) && 
        //     content.src.every((v: any) => 
        //         typeof v === "object" &&
        //         v.input !== undefined &&
        //         v.output !== undefined &&
        //         v.entrypoints !== undefined &&
        //         typeof v.input === "string" &&
        //         typeof v.output === "string" &&
        //         v.input.endsWith(".rain") &&
        //         Array.isArray(v.entrypoints) &&
        //         v.entrypoints.length > 0 &&
        //         v.entrypoints.every((e: any) => typeof e === "string")
        //     )
        // ) {
        //     compile.onSave = content.src.map((v: any) => ({
        //         input: path.isAbsolute(v.input)
        //             ? vscode.Uri.parse(v.input)
        //             : vscode.Uri.joinPath(workspaceRootUri, v.input),
        //         output: path.isAbsolute(v.input)
        //             ? vscode.Uri.parse(v.output)
        //             : vscode.Uri.joinPath(
        //                 workspaceRootUri, 
        //                 v.output.endsWith(".json") ? v.output : v.output + ".json"
        //             ),
        //         entrypoints: v.entrypoints
        //     }));
        //     for (const {input} of compile.onSave) {
        //         promiseGroup1.push(vscode.workspace.fs.stat(input).then(stat => {
        //             if (stat.type === vscode.FileType.File) {
        //                 promiseGroup3.push(vscode.workspace.fs.readFile(input).then(
        //                     v => client.sendNotification(
        //                         "watch-dotrain", 
        //                         [input.toString(), v.toString()]
        //                     ),
        //                     () => { /**/ }
        //                 ));
        //             }
        //         }));
        //         newWatched.push(input);
        //     }
        // }

        // find .rains on startup and send them to server for storing in meta store
        if (
            content?.include?.length > 0 && 
            Array.isArray(content.include) && 
            content.include.every((v: any) => typeof v === "string")
        ) {
            for (let i = 0; i < content.include.length; i++) {
                const dir = vscode.Uri.joinPath(workspaceRootUri, content.include[i]);
                newWatched.push(dir);
                promiseGroup1.push(vscode.workspace.fs.stat(dir).then(stat => {
                    if (stat.type !== vscode.FileType.Directory) {
                        if (stat.type === vscode.FileType.File && dir.toString().endsWith(".rain")) {
                            promiseGroup3.push(vscode.workspace.fs.readFile(dir).then(
                                v => client.sendNotification(
                                    "watch-dotrain", 
                                    [dir.toString(), v.toString()]
                                ),
                                () => { /**/ }
                            ));
                        }
                    }
                    else promiseGroup2.push(vscode.workspace.findFiles(
                        new vscode.RelativePattern(dir, "**/*.rain"), 
                        "**​/node_modules/**"
                    ).then(
                        v => v.forEach(doc => promiseGroup3.push(
                            vscode.workspace.fs.readFile(doc).then(
                                e => client.sendNotification(
                                    "watch-dotrain", 
                                    [doc.toString(), e.toString()]
                                ),
                                () => { /**/ }
                            )
                        )),
                        () => { /**/ }
                    ));
                }));
            }
        }
        watched = newWatched;
        await Promise.allSettled(promiseGroup1);
        await Promise.allSettled(promiseGroup2);
        await Promise.allSettled(promiseGroup3);
        client.sendNotification("reval-all");
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

function hexlify(value: Uint8Array): string {
    let result = "0x";
    for (let i = 0; i < value.length; i++) {
        result += value[i].toString(16).padStart(2, "0");
    }
    return result;
}

function arrayify(value: string): Uint8Array {
    const array: number[] = [];
    const v = value.startsWith("0x") ? value.substring(2) : value;
    for (let i = 0; i < v.length; i += 2) {
        array.push(parseInt(v.substring(i, i + 2), 16));
    }
    return Uint8Array.from(array);
}

// update meta store
async function updateMetaStore(content: any, workspaceRootUri: vscode.Uri): Promise<void> {
    const metas = [];
    const subgraphs = [];
    const deployers = [];
    if (content.subgraphs) {
        if (
            Array.isArray(content.subgraphs) && 
            content.subgraphs.every((v: any) => typeof v === "string")
        ) subgraphs.push(...content.subgraphs);
    }
    // if (Array.isArray(content?.meta) && content.length > 0) {
    //     for (let i = 0; i < content.meta.length; i++) {
    //         const meta = content.meta[i];
    //         const keys = Object.keys(meta);
    //         if (
    //             keys.length >= 1 && 
    //             (    
    //                 (
    //                     keys.includes("binary") &&
    //                     !keys.includes("hex") &&
    //                     typeof meta.binary === "string"
    //                 ) || (
    //                     keys.includes("hex") &&
    //                     !keys.includes("binary") &&
    //                     typeof meta.hex === "string"
    //                 )
    //             )
    //         ) {
    //             if (keys.includes("binary")) {
    //                 const uri = path.isAbsolute(meta.binary)
    //                     ? vscode.Uri.parse(meta.binary)
    //                     : vscode.Uri.joinPath(workspaceRootUri, meta.binary);
    //                 try {
    //                     metas.push(hexlify(await vscode.workspace.fs.readFile(uri)));
    //                 }
    //                 catch { /**/ }
    //             }
    //             if (keys.includes("hex")) {
    //                 const uri = path.isAbsolute(meta.hex)
    //                     ? vscode.Uri.parse(meta.hex)
    //                     : vscode.Uri.joinPath(workspaceRootUri, meta.hex);
    //                 try {
    //                     metas.push((await vscode.workspace.fs.readFile(uri)).toString());
    //                 }
    //                 catch { /**/ }
    //             }
    //         }
    //     }
    // }
    // if (typeof content.deployers === "object" && content.deployers !== null) {
    //     const items = Object.entries(content.deployers);
    //     for (let i = 0; i < items.length; i ++) {
    //         const [hash, details] = items[i];
    //         if (
    //             /^0x[a-fA-F0-9]+$/.test(hash) &&
    //             typeof details === "object" &&
    //             details !== null &&
    //             Object.keys(details).length >= 5 &&
    //             "expressionDeployer" in details &&
    //             typeof details.expressionDeployer === "string" &&
    //             "parser" in details &&
    //             typeof details.parser === "string" &&
    //             "store" in details &&
    //             typeof details.store === "string" &&
    //             "interpreter" in details &&
    //             typeof details.interpreter === "string" &&
    //             "constructionMeta" in details &&
    //             typeof details.constructionMeta === "object" &&
    //             details.constructionMeta !== null &&
    //             (
    //                 (
    //                     "binary" in details.constructionMeta && 
    //                     !("hex" in details.constructionMeta) && 
    //                     typeof details.constructionMeta.binary === "string"
    //                 ) || (
    //                     "hex" in details.constructionMeta && 
    //                     !("binary" in details.constructionMeta) && 
    //                     typeof details.constructionMeta.hex === "string"
    //                 )
    //             )
    //         ) {
    //             try {
    //                 const parserPath = path.isAbsolute(details.parser)
    //                     ? vscode.Uri.parse(details.parser)
    //                     : vscode.Uri.joinPath(workspaceRootUri, details.parser);
    //                 const parserArtifact = JSON.parse(
    //                     (await vscode.workspace.fs.readFile(parserPath)).toString()
    //                 );
    //                 const parser = typeof parserArtifact.deployedBytecode.object === "string" && parserArtifact.deployedBytecode.object
    //                     ? parserArtifact.deployedBytecode.object
    //                     : undefined;

    //                 const storePath = path.isAbsolute(details.store)
    //                     ? vscode.Uri.parse(details.store)
    //                     : vscode.Uri.joinPath(workspaceRootUri, details.store);
    //                 const storeArtifact = JSON.parse(
    //                     (await vscode.workspace.fs.readFile(storePath)).toString()
    //                 );
    //                 const store = typeof storeArtifact.deployedBytecode.object === "string" && storeArtifact.deployedBytecode.object
    //                     ? storeArtifact.deployedBytecode.object
    //                     : undefined;

    //                 const interpreterPath = path.isAbsolute(details.interpreter)
    //                     ? vscode.Uri.parse(details.interpreter)
    //                     : vscode.Uri.joinPath(workspaceRootUri, details.interpreter);
    //                 const interpreterArtifact = JSON.parse(
    //                     (await vscode.workspace.fs.readFile(interpreterPath)).toString()
    //                 );
    //                 const interpreter = typeof interpreterArtifact.deployedBytecode.object === "string" && interpreterArtifact.deployedBytecode.object
    //                     ? interpreterArtifact.deployedBytecode.object
    //                     : undefined;

    //                 const deployerPath = path.isAbsolute(details.expressionDeployer)
    //                     ? vscode.Uri.parse(details.expressionDeployer)
    //                     : vscode.Uri.joinPath(workspaceRootUri, details.expressionDeployer);
    //                 const deployerArtifact = JSON.parse(
    //                     (await vscode.workspace.fs.readFile(deployerPath)).toString()
    //                 );
    //                 const deployerDeployedBytecode = typeof deployerArtifact.deployedBytecode.object === "string" && deployerArtifact.deployedBytecode.object
    //                     ? deployerArtifact.deployedBytecode.object
    //                     : undefined;
    //                 const deployerBytecode = typeof deployerArtifact.bytecode.object === "string" && deployerArtifact.bytecode.object
    //                     ? deployerArtifact.bytecode.object
    //                     : undefined;

    //                 if (!parser || !store || !interpreter || !deployerBytecode || !deployerDeployedBytecode) throw "";

    //                 let metaBytes = null;
    //                 if ("hex" in details.constructionMeta && typeof details.constructionMeta.hex === "string") {
    //                     const uri =  path.isAbsolute(details.constructionMeta.hex)
    //                         ? vscode.Uri.parse(details.constructionMeta.hex)
    //                         : vscode.Uri.joinPath(
    //                             workspaceRootUri, 
    //                             details.constructionMeta.hex
    //                         );
    //                     metaBytes = (await vscode.workspace.fs.readFile(uri)).toString();
    //                 }
    //                 if ("binary" in details.constructionMeta && typeof details.constructionMeta.binary === "string") {
    //                     const uri = path.isAbsolute(details.constructionMeta.binary)
    //                         ? vscode.Uri.parse(details.constructionMeta.binary)
    //                         : vscode.Uri.joinPath(
    //                             workspaceRootUri, 
    //                             details.constructionMeta.binary
    //                         );
    //                     metaBytes = hexlify(await vscode.workspace.fs.readFile(uri));
    //                 }

    //                 if (!metaBytes) throw "";

    //                 deployers.push([
    //                     hash,
    //                     metaBytes,
    //                     deployerBytecode,
    //                     deployerDeployedBytecode,
    //                     parser, 
    //                     store,
    //                     interpreter
    //                 ]);
    //             }
    //             catch { /**/ }
    //         }
    //     }
    // }

    client.sendNotification("update-meta-store", [subgraphs, metas, deployers]);
}
