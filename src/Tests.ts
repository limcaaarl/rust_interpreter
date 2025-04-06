import { initialise } from "conductor/src/conductor/runner/util";
import { RustEvaluator } from "./RustEvaluator";
import { ILink } from "conductor/src/conduit";
import { exit } from "process";
import { BOOL_TYPE, F32_TYPE, I32_TYPE, RustType, STR_TYPE, UNIT_TYPE } from "./typechecker/Types";
import { TypeChecker } from "./typechecker/TypeChecker";
import { generateJsonAst } from "./Utils";

// Create a custom link object implementing ILink interface for Node.js environment
const customLink: ILink = {
    postMessage: function (message: any, transfer?: Transferable[] | StructuredSerializeOptions) {
        // No-op in Node.js as we don't need actual message passing
    },
    addEventListener: (type: string, listener: (event: any) => void) => {
        // No-op in Node.js as we don't need event listeners
    },
    terminate: () => {
        exit();
    }
};

// Initialize Conductor with RustEvaluator and custom link
const { runnerPlugin, conduit } = initialise(RustEvaluator, customLink);

/**
 * Test function that runs a Rust code block and verifies its result
 * @param code - The Rust code block to test
 * @param expected - The expected result
 * @param testName - Optional name for the test
 */
async function testRust(code: string, expected: any, testName: string, expectError: boolean = false) {
    const evaluator = new RustEvaluator(runnerPlugin);

    try {
        const result = await evaluator.evaluateChunk(code);
        if (result === expected) {
            console.log(`✅ Test: ${testName}`);
            return true;
        } else {
            console.error(`❌ Test: ${testName} - Mismatched results`);
            console.error(`Code:\n${code}\n`);
            console.error(`Expected: ${expected}`);
            console.error(`Actual: ${result}`);
            return false;
        }
    } catch (error) {
        if (expectError) {
            if (error.toString().includes(expected)) {
                console.log(`✅ Test: ${testName}`);
                return true;
            }
        }
        console.error(`❌ Test: ${testName} - Error occurred`);
        console.error(`Code:\n${code}\n`);
        console.error(`Expected: ${expected}`);
        console.error(`Actual: ${error}`);
        return false;
    }
}

function testTypeChecker(code: string, expected: RustType, testName: string) {
    const typeChecker = new TypeChecker();
    const jsonAst = generateJsonAst(code);

    try {
        const result = typeChecker.checkNode(jsonAst);
        if (result === expected) {
            console.log(`✅ Test: ${testName}`);
            return true;
        } else {
            console.error(`❌ Test: ${testName} - Mismatched results`);
            console.error(`Code:\n${code}\n`);
            console.error(`Expected: ${JSON.stringify(expected)}`);
            console.error(`Actual: ${JSON.stringify(result)}`);
            return false;
        }
    } catch (error) {
        console.error(`❌ Test: ${testName} - Error occurred`);
        console.error(`Code:\n${code}\n`);
        console.error(`Expected: ${JSON.stringify(expected)}`);
        console.error(`Actual: ${JSON.stringify(error)}`);
        return false;
    }
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    // Helper function to run a test and update counters
    async function runTest(code: string, expected: any, testName: string, expectError: boolean = false) {
        const result = await testRust(code, expected, testName, expectError);
        if (result) {
            testsPassed++;
        } else {
            testsFailed++;
        }
    };

    function runTypeCheckerTest(code: string, expected: RustType, testName: string) {
        const result = testTypeChecker(code, expected, testName);
        if (result) {
            testsPassed++;
        } else {
            testsFailed++;
        }
    };

    await runTest(
        `fn main() {
            let x = 5;
            x
        }`,
        5,
        "Variable assignment"
    );

    await runTest(
        `fn main() {
            let x = 5;
            x = 3;
            x
        }`,
        5,
        "Variable reassignment ignored"
    );

    await runTest(
        `fn main() {
            let x = 3;
            x
        }`,
        3,
        "Variable retrieval"
    );

    await runTest(
        `fn main() {
            let x = 1;
            {
                let x = 2;
                {
                    let x = 3;
                }
            }
            x
        }`,
        1,
        "Scope isolation"
    );

    await runTest(
        `fn main() {
            {
                let x = 10;
            }
            x;
        }`,
        "Unassigned name: x",
        "Block scope isolation",
        true
    );

    await runTest(
        `fn main() {
            {
                let x = 1;
                x
            }
        }`,
        1,
        "Block with variable retrieval"
    );

    await runTest(
        `fn main() {
            {
                let x = 1;
                ;
                x
            }
        }`,
        1,
        "Block with empty statement"
    );

    await runTest(
        `fn main() {
            {
                x;
                let x = 1;
            }
        }`,
        "Unassigned name: x",
        "Block with variable declaration after use",
        true
    );

    await runTest(
        `fn main() {
            {
                {}
                let x = 1;
                x
            }
        }`,
        1,
        "Empty block"
    );

    await runTest(
        `fn main() {
            {
                let x = 1;
                {
                    let y = 2;
                    {
                        x;
                        y
                    }
                }
            }
        }`,
        2,
        "Block with nested blocks and variable access"
    );

    await runTest(
        `fn main() {
            let x = 1;
            {
                let x = 2;
                {
                    let x = 3;
                    x
                }
            }
        }`,
        3,
        "Shadowing in nested blocks"
    );

    await runTest(
        `fn main() {
            2 + 3
        }`,
        5,
        "Addition operation"
    );

    await runTest(
        `fn main() {
            10 - 4
        }`,
        6,
        "Subtraction operation"
    );

    await runTest(
        `fn main() {
            4 * 5
        }`,
        20,
        "Multiplication operation"
    );

    await runTest(
        `fn main() {
            10 / 2
        }`,
        5,
        "Division operation"
    );

    await runTest(
        `fn main() {
            let x = 5;
            x + 3
        }`,
        8,
        "Variable assignment with addition"
    );

    await runTest(
        `fn main() {
            let x = 10;
            let y = 3;
            x - y
        }`,
        7,
        "Variable assignment with subtraction"
    );

    await runTest(
        `fn main() {
            let x = 4;
            let y = 3;
            x * y
        }`,
        12,
        "Variable assignment with multiplication"
    );

    await runTest(
        `fn main() {
            let x = 20;
            let y = 4;
            x / y
        }`,
        5,
        "Variable assignment with division"
    );

    await runTest(
        `fn main() {
            let x = 2;
            let y = 3;
            x * y + 4
        }`,
        10,
        "Compound arithmetic with multiplication and addition"
    );

    await runTest(
        `fn main() {
            let x = 6;
            let y = 3;
            x / y - 1
        }`,
        1,
        "Compound arithmetic with division and subtraction"
    );

    await runTest(
        `fn main() {
            let x = 4;
            let y = 2;
            let z = 3;
            x * y + z - 1
        }`,
        10,
        "Compound arithmetic with multiple variables"
    );

    await runTest(
        `fn main() {
            let x = 10;
            let y = 3;
            (x + y) * 2
        }`,
        26,
        "Arithmetic with parentheses"
    );

    await runTest(
        `fn main() {
            let x = 15;
            let y = 5;
            x / y * 2
        }`,
        6,
        "Complex arithmetic with multiple operations"
    );

    await runTest(
        `fn main() {
            (1 + 2) * 3 / (5 - 2)
        }`,
        3,
        "Operator precedence"
    );

    await runTest(
        `fn main() {
            1 == 1
        }`,
        true,
        "Comparison operator: =="
    );

    await runTest(
        `fn main() {
            1 != 1
        }`,
        false,
        "Comparison operator: !="
    );

    await runTest(
        `fn main() {
            1 < 2
        }`,
        true,
        "Comparison operator: <"
    );

    await runTest(
        `fn main() {
            1 <= 2
        }`,
        true,
        "Comparison operator: <="
    );

    await runTest(
        `fn main() {
            2 > 1
        }`,
        true,
        "Comparison operator: >"
    );

    await runTest(
        `fn main() {
            2 >= 2
        }`,
        true,
        "Comparison operator: >="
    );

    await runTest(
        `fn main() {
            {1;}
        }`,
        undefined,
        "Statement not producing value"
    );

    await runTest(
        `fn main() {
            if true {
                1
            } else {
                2
            }   
        }`,
        1,
        "If-else statement (true)"
    );

    await runTest(
        `fn main() {
            if false {
                1
            } else {
                2
            }   
        }`,
        2,
        "If-else statement (false)"
    );

    await runTest(
        `fn main() {
            if false {
                1
            } else if true {
                2
            } else {
                3
            }
        }`,
        2,
        "Else if statement (true)"
    );

    await runTest(
        `fn main() {
            if false {
                1
            } else if false {
                2
            } else {
                3
            }
        }`,
        3,
        "Else if statement (false)"
    );

    await runTest(
        `fn main() {
            let x = if 1 == 1 { 2 } else { 3 };
            x
        }`,
        2,
        "'Ternary' operator"
    );

    await runTest(
        `fn main() {
            add(3, 4)
        }

        fn add(x: i32, y: i32) -> i32 { 
            return x + y;
        }`,
        7,
        "Function call"
    );

    await runTest(
        `fn main() {
            add(3, 4)
        }

        fn add(x: i32, y: i32) -> i32 { 
            x + y
        }`,
        7,
        "Function call implicit return"
    );

    await runTest(
        `fn main() {
            let x = 5;
            let y = 3;
            let z = add(x, y);
            z
        }

        fn add(x: i32, y: i32) -> i32 { 
            return x + y;
        }`,
        8,
        "Function call with variables"
    );

    await runTest(
        `fn main() {
            let x = 5;
            let y = 3;
            let z = add(add(x, y), x);
            z
        }

        fn add(x: i32, y: i32) -> i32 { 
            return x + y;
        }`,
        13,
        "Chaining function calls"
    );

    await runTest(
        `fn factorial(n: u64) -> u64 {
            if (n == 0) | (n == 1) {
                1
            } else {
                n * factorial(n - 1)
            }
        }

        fn main() {
            factorial(5)
        }`,
        120,
        "Recursion"
    );

    await runTest(
        `fn main() {
            -1
        }`,
        -1,
        "Negation unary operator (number)"
    );

    await runTest(
        `fn main() {
            !true
        }`,
        false,
        "Negation unary operator (boolean)"
    );

    runTypeCheckerTest(
        `fn main() {
            1
        }
    `,
        I32_TYPE,
        "Integer type"
    );

    runTypeCheckerTest(
        `fn main() {
            1.9
        }
    `,
        F32_TYPE,
        "Float type"
    );

    runTypeCheckerTest(
        `fn main() {
            true
        }
    `,
        BOOL_TYPE,
        "Boolean type"
    );

    runTypeCheckerTest(
        `fn main() {
            "hello"
        }
    `,
        STR_TYPE,
        "String type"
    );

    runTypeCheckerTest(
        `fn main() {
            1 + 3
        }
    `,
        I32_TYPE,
        "Arithmetic type"
    );

    runTypeCheckerTest(
        `fn main() {
            1;
            2;
            3.5
        }
    `,
        F32_TYPE,
        "Last expression type"
    );

    runTypeCheckerTest(
        `fn main() {
            let x = 1;
        }
    `,
        UNIT_TYPE,
        "Variable declaration type"
    );

    runTypeCheckerTest(
        `fn main() {
            let x = 1;
            x
        }
    `,
        I32_TYPE,
        "Variable usage type"
    );

    runTypeCheckerTest(
        `fn main() {
            {
                1
            }
        }
    `,
        I32_TYPE,
        "Nested block type"
    );
    
    await runTest(
        `fn main() {
            if true {
                1
            } else {
                "hi"
            }
        }
    `,
        "Mismatched types",
        "If statement branches with different type",
        true
    );

    // Print summary
    const totalTests = testsPassed + testsFailed;
    console.log(`\nSummary:`);
    console.log(`Passed: ${testsPassed} / ${totalTests}`);
}

runTests().then(() => customLink.terminate());