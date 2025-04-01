export type Instruction =
    | { tag: "LDC"; val: any }
    | { tag: "LD"; sym: string }
    | { tag: "LDF"; prms: any; retType: string; addr: number }
    | { tag: "ASSIGN"; sym: string }
    | { tag: "ASSIGN_CONST"; sym: string; type: string }
    | { tag: "ASSIGN_STATIC"; sym: string; type: string }
    | { tag: "JOF"; addr: number }
    | { tag: "GOTO"; addr: number }
    | { tag: "UNOP"; sym: string }
    | { tag: "BINOP"; sym: string }
    | { tag: "CALL"; arity: number }
    | { tag: "RESET"; }
    | { tag: "ENTER_SCOPE"; syms: any }
    | { tag: "EXIT_SCOPE" }
    | { tag: "POP" }
    | { tag: "DONE" };