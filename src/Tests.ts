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
        `fn factorial(n: i32) -> i32 {
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

    await runTest(
        `// Function WITH explicit type declaration
        fn is_even(n: i32) -> bool {
            // Base case
            if n == 0 {
                return true;
            }
            // Recursive case - calls the implicitly typed function
            is_odd(n - 1)
        }

        fn is_odd(n: i32) -> bool {
            // Base case
            if n == 0 {
                false
            } else {
                // Recursive case - calls the explicitly typed function
                is_even(n - 1)
            }
        }

        fn main() {
            is_even(4)
        }
    `,
        true,
        "Mutual recursion"
    );

    await runTest(
        `fn main() {
            true && false
        }`,
        false,
        "Logical AND operation"
    );

    await runTest(
        `fn main() {
            false || true
        }`,
        true,
        "Logical OR operation"
    );

    await runTest(
        `fn main() {
            true & false
        }`,
        false,
        "Logical AND operation"
    );

    await runTest(
        `fn main() {
            false | true
        }`,
        true,
        "Logical OR operation"
    );

    await runTest(
        `fn main() {
            add("string", 5)
        }
        
        fn add(x: i32, y: i32) -> i32 {
            x + y
        }`,
        "expected i32 but got str",
        "Function parameter type mismatch (on call side)",
        true
    );

    await runTest(
        `fn main() {
            add(1, 5)
        }
        
        fn add(x: i32, y: i32) -> str {
            x + y
        }`,
        "returns i32, but its declared return type is str",
        "Function return type mismatch",
        true
    );

    await runTest(
        `fn main() {
            add("string", 5)
        }
        
        fn add(x: str, y: i32) -> str {
            x + y
        }`,
        "must be numeric, got str",
        "Arithmetic operation type mismatch",
        true
    );

    await runTest(
        `fn main() {
            let x: i32 = 1.5;
        }
        `,
        "Cannot assign value of type f32 to variable x of type i32",
        "Assignment type mismatch (f32 to i32)",
        true
    );


    // I32_TYPE to other types
    await runTest(
        `fn main() {
        let x: f32 = 42;
    }
    `,
        "Cannot assign value of type i32 to variable x of type f32",
        "Assignment type mismatch (i32 to f32)",
        true
    );

    await runTest(
        `fn main() {
        let x: bool = 1;
    }
    `,
        "Cannot assign value of type i32 to variable x of type bool",
        "Assignment type mismatch (i32 to bool)",
        true
    );

    await runTest(
        `fn main() {
        let x: str = 42;
    }
    `,
        "Cannot assign value of type i32 to variable x of type str",
        "Assignment type mismatch (i32 to str)",
        true
    );

    await runTest(
        `fn main() {
        let x: char = 65;
    }
    `,
        "Cannot assign value of type i32 to variable x of type char",
        "Assignment type mismatch (i32 to char)",
        true
    );

    // F32_TYPE to other types
    await runTest(
        `fn main() {
        let x: i32 = 3.14;
    }
    `,
        "Cannot assign value of type f32 to variable x of type i32",
        "Assignment type mismatch (f32 to i32)",
        true
    );

    await runTest(
        `fn main() {
        let x: bool = 1.1;
    }
    `,
        "Cannot assign value of type f32 to variable x of type bool",
        "Assignment type mismatch (f32 to bool)",
        true
    );

    await runTest(
        `fn main() {
        let x: str = 3.14;
    }
    `,
        "Cannot assign value of type f32 to variable x of type str",
        "Assignment type mismatch (f32 to str)",
        true
    );

    await runTest(
        `fn main() {
        let x: char = 65.2;
    }
    `,
        "Cannot assign value of type f32 to variable x of type char",
        "Assignment type mismatch (f32 to char)",
        true
    );

    // BOOL_TYPE to other types
    await runTest(
        `fn main() {
        let x: i32 = true;
    }
    `,
        "Cannot assign value of type bool to variable x of type i32",
        "Assignment type mismatch (bool to i32)",
        true
    );

    await runTest(
        `fn main() {
        let x: f32 = true;
    }
    `,
        "Cannot assign value of type bool to variable x of type f32",
        "Assignment type mismatch (bool to f32)",
        true
    );

    await runTest(
        `fn main() {
        let x: str = true;
    }
    `,
        "Cannot assign value of type bool to variable x of type str",
        "Assignment type mismatch (bool to str)",
        true
    );

    await runTest(
        `fn main() {
        let x: char = true;
    }
    `,
        "Cannot assign value of type bool to variable x of type char",
        "Assignment type mismatch (bool to char)",
        true
    );

    // STR_TYPE to other types
    await runTest(
        `fn main() {
        let x: i32 = "42";
    }
    `,
        "Cannot assign value of type str to variable x of type i32",
        "Assignment type mismatch (str to i32)",
        true
    );

    await runTest(
        `fn main() {
        let x: f32 = "3.14";
    }
    `,
        "Cannot assign value of type str to variable x of type f32",
        "Assignment type mismatch (str to f32)",
        true
    );

    await runTest(
        `fn main() {
        let x: bool = "true";
    }
    `,
        "Cannot assign value of type str to variable x of type bool",
        "Assignment type mismatch (str to bool)",
        true
    );

    await runTest(
        `fn main() {
        let x: char = "A";
    }
    `,
        "Cannot assign value of type str to variable x of type char",
        "Assignment type mismatch (str to char)",
        true
    );

    // CHAR_TYPE to other types
    await runTest(
        `fn main() {
        let x: i32 = 'A';
    }
    `,
        "Cannot assign value of type char to variable x of type i32",
        "Assignment type mismatch (char to i32)",
        true
    );

    await runTest(
        `fn main() {
        let x: f32 = 'A';
    }
    `,
        "Cannot assign value of type char to variable x of type f32",
        "Assignment type mismatch (char to f32)",
        true
    );

    await runTest(
        `fn main() {
        let x: bool = 'A';
    }
    `,
        "Cannot assign value of type char to variable x of type bool",
        "Assignment type mismatch (char to bool)",
        true
    );

    await runTest(
        `fn main() {
        let x: str = 'A';
    }
    `,
        "Cannot assign value of type char to variable x of type str",
        "Assignment type mismatch (char to str)",
        true
    );

    // Same-type assignments (all should be valid)
    await runTest(
        `fn main() {
        let x: i32 = 42;
        x
    }
    `,
        42,
        "Valid assignment (i32 to i32)",
    );

    await runTest(
        `fn main() {
        let x: f32 = 3.14;
        x
    }
    `,
        3.14,
        "Valid assignment (f32 to f32)",
    );

    await runTest(
        `fn main() {
        let x: bool = true;
        x
    }
    `,
        true,
        "Valid assignment (bool to bool)",
    );

    await runTest(
        `fn main() {
        let x: str = "hello";
        x
    }
    `,
        "hello",
        "Valid assignment (str to str)",
    );

    await runTest(
        `fn main() {
        let x: char = 'A';
        x
    }
    `,
        "'A'",
        "Valid assignment (char to char)",
    );



    // Print summary
    const totalTests = testsPassed + testsFailed;
    console.log(`\nSummary:`);
    console.log(`Passed: ${testsPassed} / ${totalTests}`);
}

runTests().then(() => customLink.terminate());