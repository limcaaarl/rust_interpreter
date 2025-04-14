export type Instruction =
    | { tag: "LDC"; val: any }
    | { tag: "LD"; sym: string; pos: any }
    | { tag: "LDF"; arity: number; retType: string; addr: number }
    | { tag: "ASSIGN"; pos: any }
    | { tag: "ASSIGN_CONST"; sym: string; type: string }
    | { tag: "ASSIGN_STATIC"; sym: string; type: string }
    | { tag: "JOF"; addr: number }
    | { tag: "GOTO"; addr: number }
    | { tag: "UNOP"; sym: string }
    | { tag: "BINOP"; sym: string }
    | { tag: "CALL"; arity: number }
    | { tag: "RESET"; }
    | { tag: "ENTER_SCOPE"; num: number }
    | { tag: "EXIT_SCOPE" }
    | { tag: "POP" }
    | { tag: "DROP"; pos: any }
    | { tag: "REF"; pos: any; mutable: boolean } // Create a reference to a value
    | { tag: "DEREF" } // Dereference a reference
    | { tag: "UPDATE_REF" } // Update a reference's value
    | { tag: "DONE" };