// test for typescript/javascript embedded rainlang

function rainlang(
    stringChunks: TemplateStringsArray,
    ...vars: any[]
): string {
    let result = "";
    for (let i = 0; i < stringChunks.length; i++) {
        result = result + stringChunks[i] + (vars[i] ?? "");
    }
    return result;
}

const x = rainlang`
a: add(1 2),
b: mul(3 4);
`;