import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate, sleep } from "./utils";


async function testCompletion(
    docUri: vscode.Uri,
    position: vscode.Position,
    expectedCompletionList: vscode.CompletionList
) {
    const { ext, editor, doc } = await activate(docUri);
    const actualCompletionList = (await vscode.commands.executeCommand(
        "vscode.executeCompletionItemProvider",
        docUri,
        position
    )) as vscode.CompletionList;

    assert.ok(actualCompletionList.items.length == 3);
    expectedCompletionList.items.forEach((expectedItem, i) => {
        const actualItem = actualCompletionList.items[i];
        assert.equal((actualItem.label as vscode.CompletionItemLabel).label, expectedItem.label);
        assert.equal(actualItem.kind, expectedItem.kind);
    });
}


suite("Rainlang Code Completion", () => {

    const docUri = getDocUri(
        vscode.workspace.workspaceFolders![0].uri, // the workspace URI of the vscode dev instance
        "completion.rain" // file path (from "fixtures" folder)
    );

    test("Should provide filtered completion items based on provided position", async () => {
        await testCompletion(docUri, new vscode.Position(2, 6), {
            items: [
                { label: "add", kind: vscode.CompletionItemKind.Function },
                { label: "sat-add", kind: vscode.CompletionItemKind.Function },
                { label: "saturating-add", kind: vscode.CompletionItemKind.Function }
            ]
        });
    });
});
