export type Instruction =
    | { tag: "LDC"; val: any }
    | { tag: "LD"; sym: string }
    | { tag: "ASSIGN"; sym: string }
    | { tag: "JOF"; addr: number }
    | { tag: "GOTO"; addr: number }
    | { tag: "POP" }
    | { tag: "DONE" };