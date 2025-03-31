import { Instruction } from "./compiler/Instruction";

export class VirtualMachine {
    private PC: number = 0;
    private OS: any[] = [];
    private E: any; // TODO: Change this to a more suitable DS
    private RTS: any[] = [];
    private instr: Instruction[];

    constructor(instructions: Instruction[]) {
        this.instr = instructions;
    }

    // runs the machine code instructions
    public run(): any {
        while (this.instr[this.PC].tag !== "DONE") {
            const currentInstr = this.instr[this.PC];
            this.microcode(currentInstr);
        }

        return this.peek();
    }

    // TODO: Implement all the necessary instructions
    private microcode(instr: Instruction): void {
        switch (instr.tag) {
            case "LDC":
                this.PC++;
                this.OS.push(instr.val);
                break;
            case "LD":
                this.PC++;
                // TODO: implement a lookup function to fetch variable value
                // this.OS.push(this.lookup(instr.sym));
                break;
            case "ASSIGN":
                this.PC++;
                // TODO: implement an assign function to update the variable.
                // this.assign(instr.sym, this.peek());
                break;
            default:
                throw new Error("Unknown instruction tag: " + instr.tag);
        }
    }

    private peek(): any {
        return this.OS[this.OS.length - 1];
    }
}
