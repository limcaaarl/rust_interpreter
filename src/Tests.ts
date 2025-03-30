import { initialise } from "conductor/src/conductor/runner/util";
import { RustEvaluator } from "./RustEvaluator";
import { ILink } from "conductor/src/conduit";
import { exit } from "process";

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
async function testRust(code: string, expected: any, testName?: string, expectError: boolean = false) {
    const evaluator = new RustEvaluator(runnerPlugin);

    try {
        const result = await evaluator.evaluateChunk(code);
        if (result === expected) {
            console.log(`✅ Test: ${testName || 'passed'}`);
            return true;
        } else {
            console.error(`❌ Test: ${testName || 'failed'} - Mismatched results:`);
            console.error(`Code:\n${code}\n`);
            console.error(`Expected: ${expected}`);
            console.error(`Actual: ${result}`);
            return false;
        }
    } catch (error) {
        if (expectError) {
            if (error.toString().includes(expected)) {
                console.log(`✅ Test: ${testName || 'passed'}`);
                return true;
            }
        }
        console.error(`❌ Test: ${testName || 'failed'} - Error occurred:`);
        console.error(`Code:\n${code}\n`);
        console.error(`Expected: ${expected}`);
        console.error(`Actual: ${error}`);
        return false;
    }
}

async function runTests() {
    let testsPassed = 0;
    let testsFailed = 0;

    // Helper function to run a test and update counters
    const runTest = async (code: string, expected: any, testName: string, expectError: boolean = false) => {
        const result = await testRust(code, expected, testName, expectError);
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
        "Error: Variable 'x' not found",
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
        "Variable 'x' not found",
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
            (1 + 2) * 3 / (6 - 3)
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
        null,
        "Statement not producing value"
    );


    // Print summary
    const totalTests = testsPassed + testsFailed;
    console.log(`\nSummary:`);
    console.log(`Passed: ${testsPassed} / ${totalTests}`);
}

runTests().then(() => customLink.terminate());