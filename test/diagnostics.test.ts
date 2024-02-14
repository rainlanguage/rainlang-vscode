import * as vscode from "vscode";
import * as assert from "assert";
import { getDocUri, activate, toRange } from "./utils";


async function testDiagnostics(docUri: vscode.Uri, expectedDiagnostics: vscode.Diagnostic[]) {
    await activate(docUri);
    const actualDiagnostics = vscode.languages.getDiagnostics(docUri);

    assert.equal(actualDiagnostics.length, 1);
    expectedDiagnostics.forEach((expectedDiagnostic, i) => {
        const actualDiagnostic = actualDiagnostics[i];
        assert.equal(actualDiagnostic.message, expectedDiagnostic.message);
        assert.equal(actualDiagnostic.severity, expectedDiagnostic.severity);
        assert.equal(actualDiagnostic.code, expectedDiagnostic.code);
        assert.equal(actualDiagnostic.source, expectedDiagnostic.source);
        assert.deepEqual(actualDiagnostic.range, expectedDiagnostic.range);
    });
}

suite("Rainlang Diagnostics", () => {

    const docUri = getDocUri(
        vscode.workspace.workspaceFolders![0].uri, // the workspace URI of the vscode dev instance
        "diagnostics.rain" // file path (from "fixtures" folder)
    );

    test("Should detect diagnostics correctly", async () => {
        await testDiagnostics(docUri, [
            { 
                message : "expected semi", 
                range   : toRange(2, 16, 2, 16), 
                severity: vscode.DiagnosticSeverity.Error, 
                code    : 1032,
                source  : "rainlang"
            }
        ]);
    });
});
