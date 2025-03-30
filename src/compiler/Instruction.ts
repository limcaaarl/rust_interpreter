export type Instruction =
    | { tag: "LDC"; val: any }
    | { tag: "LD"; sym: string }
    | { tag: "ASSIGN"; sym: string }
    | { tag: "ASSIGN_CONST"; sym: string; type: string }
    | { tag: "ASSIGN_STATIC"; sym: string; type: string }
    | { tag: "JOF"; addr: number }
    | { tag: "GOTO"; addr: number }
    | { tag: "POP" }
    | { tag: "DONE" };