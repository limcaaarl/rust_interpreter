import { initialise } from "conductor/src/conductor/runner/util";
import { RustEvaluator } from "./RustEvaluator";
import { ILink } from "conductor/src/conduit";
import { exit } from "process";
import { BOOL_TYPE, F32_TYPE, I32_TYPE, RustType, STR_TYPE, UNIT_TYPE } from "./typechecker/Types";
import { TypeChecker } from "./typechecker/TypeChecker";
import { generateJsonAst, deepEqual, error } from "./Utils";

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
        if (deepEqual(result, expected)) {
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
    let failedTestNames = []; // Add array to track failed test names

    // Helper function to run a test and update counters
    async function runTest(code: string, expected: any, testName: string, expectError: boolean = false) {
        const result = await testRust(code, expected, testName, expectError);
        if (result) {
            testsPassed++;
        } else {
            testsFailed++;
            failedTestNames.push(testName); // Record failed test name
        }
    };

    function runTypeCheckerTest(code: string, expected: RustType, testName: string) {
        const result = testTypeChecker(code, expected, testName);
        if (result) {
            testsPassed++;
        } else {
            testsFailed++;
            failedTestNames.push(testName); // Record failed test name
        }
    };

    console.log("\n=== VARIABLE DECLARATIONS AND SCOPING ===");
    // =====================================================
    // Tests for variable declarations and scoping
    // =====================================================

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
            let x = 5;
            let x = "hello";
            x
        }`,
        "hello",
        "Shadowing with different types"
    );

    await runTest(
        `fn main() {
            let x = 5;
            let x = 10;
            x
        }`,
        10,
        "Variable redeclaration in same scope"
    );

    console.log("\n=== ARITHMETIC OPERATIONS ===");
    // =====================================================
    // Tests for arithmetic operations
    // =====================================================

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
            10 / 0
        }`,
        "Division by zero",
        "Division by zero",
        true
    );

    await runTest(
        `fn main() {
            10 % 3
        }`,
        1,
        "Modulo operation"
    );

    console.log("\n=== COMPARISON OPERATIONS ===");
    // =====================================================
    // Tests for comparison operations
    // =====================================================

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
            "hello" == "hello"
        }`,
        true,
        "String equality comparison"
    );

    await runTest(
        `fn main() {
            5 == "5"
        }`,
        "Cannot compare values of different types",
        "Comparing different types",
        true
    );

    await runTest(
        `fn main() {
            5 == 5.0
        }`,
        true,
        "Comparing different numerical types (5 with 5.0)",
    );

    await runTest(
        `fn main() {
            5 == 5.1
        }`,
        false,
        "Comparing different numerical types (5 with 5.1)",
    );

    console.log("\n=== CONTROL FLOW ===");
    // =====================================================
    // Tests for control flow
    // =====================================================

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
            if true {
                5
            }
        }`,
        5,
        "If without else"
    );

    await runTest(
        `fn main() {
            if true {
            } else {
                2
            }
        }`,
        "Mismatched types in if/else expression",
        "Empty if block",
        true
    );

    await runTest(
        `fn main() {
            if 5 {
                1
            } else {
                2
            }
        }`,
        "If condition must be boolean",
        "If condition not boolean",
        true
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            while x > 2 {
                x = x - 1;
            }
            x
        }`,
        2,
        "While loop",
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y: str = "Hello";
            while y {
                x -= 1;
            }
            x
        }`,
        "Type checking failed: Loop condition must be boolean, got str",
        "While loop pred must be boolean",
        true
    );

    console.log("\n=== FUNCTIONS ===");
    // =====================================================
    // Tests for functions
    // =====================================================

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
            get_five()
        }

        fn get_five() -> i32 {
            5
        }`,
        5,
        "Function with no parameters"
    );

    await runTest(
        `fn main() {
            do_nothing();
            5
        }

        fn do_nothing() {
            let x = 1;
        }`,
        5,
        "Function without return type"
    );

    await runTest(
        `fn main() {
            early_return(true)
        }

        fn early_return(flag: bool) -> i32 {
            if flag {
                return 10;
            }
            20
        }`,
        10,
        "Function with early return"
    );

    await runTest(
        `fn main() {
            non_existent()
        }`,
        "Unassigned name: non_existent",
        "Calling non-existent function",
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

    console.log("\n=== LOGICAL OPERATIONS ===");
    // =====================================================
    // Tests for logical operations
    // =====================================================

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
        "Bitwise AND operation"
    );

    await runTest(
        `fn main() {
            false | true
        }`,
        true,
        "Bitwise OR operation"
    );

    console.log("\n=== UNARY OPERATIONS ===");
    // =====================================================
    // Tests for unary operations
    // =====================================================

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

    await runTest(
        `fn main() {
            !!true
        }`,
        true,
        "Double negation (boolean)"
    );

    await runTest(
        `fn main() {
            !5
        }`,
        "Cannot apply ! to non-boolean type",
        "Negation of non-boolean",
        true
    );

    console.log("\n=== TYPE CHECKING ===");
    // =====================================================
    // Tests for type checking
    // =====================================================

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

    runTypeCheckerTest(
        `fn main() {
            {}
        }
    `,
        UNIT_TYPE,
        "Empty block type"
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

    console.log("\n=== TYPE MISMATCH ERRORS ===");
    // =====================================================
    // Tests for type mismatch errors
    // =====================================================

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

    console.log("\n=== VALID TYPE ASSIGNMENTS ===");
    // =====================================================
    // Valid type assignments
    // =====================================================

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
        "A",
        "Valid assignment (char to char)",
    );

    await runTest(
        `fn main() {
        let x: str = "'A'";
        x
    }
    `,
        "'A'",
        "'A' string",
    );

    runTypeCheckerTest(
        `fn main() {
        let x: f32 = 1.0;
        x
    }
    `,
        F32_TYPE,
        "1.0 f32",
    );

    console.log("\n=== MUTABLE VARIABLES ===");
    // =====================================================
    // Tests for mutable variables and reassignment
    // =====================================================

    await runTest(
        `fn main() {
            let mut x = 5;
            x = 10;
            x
        }`,
        10,
        "Mutable variable reassignment"
    );

    await runTest(
        `fn main() {
            let x = 5;
            x = 10;
            x
        }`,
        "Cannot assign to immutable variable",
        "Reassigning immutable variable",
        true
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            {
                let mut y = 10;
                x = y;
                y = 20;
                x
            }
        }`,
        10,
        "Mutable variable assignment between scopes"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let mut y = 10;
            x = y;
            y = 20;
            x  // Should still be 10
        }`,
        10,
        "Mutable variable assignment (value not reference)"
    );

    await runTest(
        `fn main() {
            let mut x: i32 = 5;
            x = 3.14;
            x
        }`,
        "Cannot assign value of type 'f32' to variable 'x' of type 'i32'",
        "Type checking with mutable reassignment",
        true
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            x = 10;
            let x = 15;  // Shadows the mutable x
            x
        }`,
        15,
        "Shadowing a mutable variable"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            x = 10;
            x = 15;
            x = 20;
            x
        }`,
        20,
        "Multiple reassignments"
    );

    console.log("\n=== REFERENCES AND DEREFERENCING ===");
    // =====================================================
    // Tests for references and dereferencing
    // =====================================================

    await runTest(
        `fn main() {
            let x = 5;
            let y = &x;
            *y
        }`,
        5,
        "Immutable reference and dereference"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &mut x;
            *y = 10;
            x
        }`,
        10,
        "Mutable reference, dereference and assignment"
    );

    await runTest(
        `fn main() {
            let x = 5;
            let y = &x;
            *y = 10;
            x
        }`,
        "Cannot assign through an immutable reference",
        "Assignment through immutable reference",
        true
    );

    await runTest(
        `fn main() {
            let x = 5;
            let y = &x;
            *y + 10
        }`,
        15,
        "Dereference in expression"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &mut x;
            *y = *y + 10;
            x
        }`,
        15,
        "Compound assignment through dereference"
    );

    await runTest(
        `fn main() {
            let mut x = 10;
            {
                let y = &mut x;
                *y = 20;
            }
            x
        }`,
        20,
        "Mutable reference in inner scope"
    );

    await runTest(
        `fn main() {
            let y = 10;
            *y
        }`,
        "Cannot dereference non-reference type",
        "Dereferencing non-reference value",
        true
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &x;  // Immutable borrow
            *y = 10;
            x
        }`,
        "Cannot assign through an immutable reference.",
        "Updating through an immutable borrow",
        true
    );

    await runTest(
        `fn main() {
            let x = 5;
            let y = &x;
            let z = &y;
            **z
        }`,
        5,
        "Reference to a reference"
    );

    console.log("\n=== NESTED REFERENCES AND DEREFERENCING ===");
    // =====================================================
    // Tests for nested references and dereferencing
    // =====================================================

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &mut x;
            let z = &y;  // Reference to a reference
            **z  // Double dereference
        }`,
        5,
        "Reference to a reference (double dereference)"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let mut y = &mut x;
            let z = &mut y;  // Mutable reference to a reference
            **z = 10;  // Assignment through double dereference
            x
        }`,
        10,
        "Assignment through double dereference"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let mut y = &mut x;
            let mut z = &mut y;
            let w = &mut z;
            ***w = 15;
            x
        }`,
        15,
        "Triple nested references"
    );

    console.log("\n=== FUNCTION CALLS WITH REFERENCES ===");
    // =====================================================
    // Tests for function calls with references
    // =====================================================

    await runTest(
        `fn main() {
            let mut x = 5;
            increment(&mut x);
            x
        }
        
        fn increment(n: &mut i32) {
            *n = *n + 1;
        }`,
        6,
        "Function with mutable reference parameter"
    );

    await runTest(
        `fn main() {
            let x = 5;
            increment(&mut x);
            x
        }
        
        fn increment(n: &mut i32) {
            *n += 1;
        }`,
        "Cannot create mutable reference to immutable variable",
        "Creating mutable reference to immutable variable",
        true
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = print_and_return(&x);
            y
        }
        
        fn print_and_return(n: &i32) -> i32 {
            return *n;
        }`,
        5,
        "Function with immutable reference parameter"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = get_ref(&mut x);
            *y = 10;
            x
        }
        
        fn get_ref(n: &mut i32) -> &mut i32 {
            n
        }`,
        10,
        "Function returning reference"
    );

    console.log("\n=== MULTIPLE REFERENCES ===");
    // =====================================================
    // Tests for multiple references
    // =====================================================

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &mut x;
            let z = &mut x;  // Should fail - already mutably borrowed
            *y + *z
        }`,
        "Cannot borrow 'x' as mutable more than once",
        "Multiple mutable borrows",
        true
    );

    await runTest(
        `fn main() {
            let x = 5;
            let y = &x;
            let z = &x;  // Multiple immutable borrows are okay
            *y + *z
        }`,
        10,
        "Multiple immutable borrows"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &x;  // Immutable borrow
            let z = &mut x;  // Should fail - already borrowed immutably
            *z = 10;
            *y
        }`,
        "Cannot borrow 'x' as mutable because it is also borrowed as immutable",
        "Mutable borrow when already borrowed immutably",
        true
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            {
                let y = &mut x;  // Mutable borrow in inner scope
                *y = 10;
            }  // Mutable borrow ends here
            let z = &mut x;  // OK because previous borrow is out of scope
            *z = 15;
            x
        }`,
        15,
        "Mutable borrows in different scopes"
    );

    await runTest(
        `fn main() {
            let mut x = 5;
            let y = &mut x;
            let z = &x;  // Should fail - already mutably borrowed
            *z
        }`,
        "Error: Cannot borrow 'x' as immutable because it is also borrowed as mutable.",
        "Immutable borrow when already borrowed mutably",
        true
    );

    console.log("\n=== TYPE CHECKING FOR REFERENCES ===");
    // =====================================================
    // Type checking for references
    // =====================================================

    runTypeCheckerTest(
        `fn main() {
            let x = 5;
            let y = &x;
            y
        }`,
        { kind: 'reference', targetType: I32_TYPE, mutable: false },
        "Type of immutable reference"
    );

    runTypeCheckerTest(
        `fn main() {
            let mut x = 5;
            let y = &mut x;
            y
        }`,
        { kind: "reference", targetType: I32_TYPE, mutable: true },
        "Type of mutable reference"
    );

    runTypeCheckerTest(
        `fn main() {
            let x = 5;
            let y = &x;
            *y
        }`,
        I32_TYPE,
        "Type of dereferenced value"
    );

    runTypeCheckerTest(
        `fn main() {
            let x = 5;
            let y = &x;
            let z = &y;
            z
        }`,
        { kind: 'reference', targetType: { kind: 'reference', targetType: I32_TYPE, mutable: false }, mutable: false },
        "Type of nested reference"
    );

    runTypeCheckerTest(
        `fn main() {
            let x = true;
            let y = &x;
            y
        }`,
        { kind: 'reference', targetType: BOOL_TYPE, mutable: false },
        "Reference to boolean type"
    );

    
    // =====================================================
    // Tests for Ownership and Borrowing
    // =====================================================
    console.log("\n=== Ownership and Borrowing ===");
    await runTest(
        `fn main() {
            let mut x: str = "hello";
            let r1 = &x;
            let r2 = &x;
            let r3 = &mut x;
        }`,
        "Cannot borrow 'x' as mutable because it is also borrowed as immutable.",
        "Borrowing a borrowed variable (immutable) as mutable should fail",
        true
    );

    await runTest(
        `fn main() {
            let mut x: str = "hello";
            let r3 = &mut x;
            let r1 = &x;
        }`,
        "Error: Cannot borrow 'x' as immutable because it is also borrowed as mutable.",
        "Borrowing a borrowed variable (mutable) as immutable should fail",
        true
    );

    await runTest(
        `fn main() {
            let mut s: str = "hello";
            let t = s;
            s
        }
        `,
        "Variable 's' has been moved and cannot be used.",
        "Borrowing of moved value should fail",
        true
    );

    await runTest(
        `fn main() {
            let mut s1: str = "Hello";
            let s2 = &mut s1;
            let s3 = s1;

            s3
        }
        `,
        "Hello",
        "Should be able to move ownership even if the variable is being borrowed."
    );

    await runTest(
        `fn main() {
            let mut s1: str = "Hello";
            let s2 = &mut s1;
            let s3 = s1;

            s1
        }
        `,
        "Error: Variable 's1' has been moved and cannot be used.",
        "Should be able to move ownership even if the variable is being borrowed.",
        true
    );

    await runTest(
        `
        fn main() {
            let mut x = 5;
            double(x);
            x
        }
        
        fn double(x: i32) -> i32 {
            return x * 2;
        }
        `,
        "Error: Variable 'x' has been moved and cannot be used.",
        "Passing variable to a function would make it lose ownership",
        true

    );

    await runTest(
        `
        fn main() {
            let mut x = 5;
            x = double(x);
            x
        }
        
        fn double(x: i32) -> i32 {
            return x * 2;
        }
        `,
        10,
        "Reassigning a value (through function call) will make the variable own the returned value"
    );

    await runTest(
        `
        fn main() {
            let mut x = 5;
            let mut y = 10;
            y = x;
            x
        }
        `,
        "Error: Variable 'x' has been moved and cannot be used.",
        "Passing ownership through assignment, calling moved variable will fail",
        true
    );

    await runTest(
        `
        fn main() {
            let mut x = 5;
            let mut y = 10;
            y = x;
            y
        }
        `,
        5,
        "Passing ownership through assignment, calling new owner will succeed",
    );

    await runTest(
        `
        fn main() {
            let mut x = 5;
            let mut y = x;
            x
        }
        `,
        "Error: Variable 'x' has been moved and cannot be used.",
        "Passing ownership through let statements, calling moved variable will fail",
        true
    );

    await runTest(
        `
        fn main() {
            let mut x = 5;
            let mut y = x;
            y
        }
        `,
        5,
        "Passing ownership through let statements, calling new owner will succeed",
    );

    await runTest(
        `
        fn main() {
            let x:i32 = 10;
            let y = test(x);
            y
        }

        fn test(ab: i32) -> i32 {
            let abc = 5;
            let z = 10;
            let b = 20;
            ab
        }
        `,
        10,
        "Assignment of function calls to a variable will make that variable own the return value.",
    );

    // Print summary
    const totalTests = testsPassed + testsFailed;
    console.log(`\nSummary:`);
    console.log(`Passed: ${testsPassed} / ${totalTests}`);
    
    // Print failed test names
    if (failedTestNames.length > 0) {
        console.log(`\nFailed Tests:`);
        failedTestNames.forEach(name => {
            console.log(`- ${name}`);
        });
    }
}

runTests().then(() => customLink.terminate());