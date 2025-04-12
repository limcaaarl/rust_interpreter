import { displayInstructions } from "../compiler/CompilerHelper";
import { Instruction } from "../compiler/Instruction";
import { Heap } from "./Heap";
import { apply_binop, apply_unop } from "./VMHelper";

export class VirtualMachine {
    // VM Registers
    private PC: number = 0;
    private OS: any[] = [];
    private E: number;
    private RTS: any[] = [];
    private instr: Instruction[];

    private heap: Heap;

    constructor(instructions: Instruction[]) {
        this.instr = instructions;
        this.heap = new Heap();
        this.heap.init(10000);
        this.E = this.heap.heap_allocate_Environment(0);
    }

    // runs the machine code instructions
    public run(): any {
        // displayInstructions(this.instr);
        while (this.instr[this.PC].tag !== "DONE") {
            const currentInstr = this.instr[this.PC++];
            // this.debugVm(currentInstr);
            this.microcode(currentInstr);
        }
        // return this.peek(this.OS, 0);
        // console.log(this.peek(this.OS, 0))
        return this.heap.address_to_TS_value(this.peek(this.OS, 0));
    }

    private microcode(instr: Instruction): void {
        switch (instr.tag) {
            case "POP":
                this.OS.pop();
                break;
            case "LDC":
                // this.OS.push(instr.val);
                this.OS.push(this.heap.TS_value_to_address(instr.val));
                break;
            case "LD": {
                const val = this.heap.heap_get_Environment_value(this.E, instr.pos);
                if (this.heap.is_Unassigned(val)) {
                    throw new Error("unassigned name: " + instr.sym);
                }
                this.OS.push(val);
                break;
            }
            case "ASSIGN": {
                this.heap.heap_set_Environment_value(
                    this.E,
                    instr.pos,
                    this.peek(this.OS, 0)
                );
                break;
            }
            case "REF": {
                // Pass both the location information AND the current environment
                const refAddress = this.heap.heap_allocate_Reference(instr.pos, instr.mutable, this.E);
                this.OS.push(refAddress);
                break;
            }
            case "DEREF": {
                // Dereference a reference
                const refAddress = this.OS.pop();
                if (!this.heap.is_Reference(refAddress)) {
                    throw new Error("Cannot dereference a non-reference value");
                }
                
                const targetValue = this.heap.heap_get_Reference_value(refAddress);
                this.OS.push(targetValue);
                break;
            }
            case "UPDATE_REF": {
                // For assigning to a dereferenced reference (*x = value)
                const value = this.OS.pop(); // Value to assign
                const refAddress = this.OS.pop(); // Reference address

                // Check if reference exists and is mutable
                if (!this.heap.is_Reference(refAddress)) {
                    throw new Error("Cannot update through a non-reference value");
                }

                if (!this.heap.is_Reference_mutable(refAddress)) {
                    throw new Error("Cannot update through an immutable reference");
                }

                this.heap.heap_set_Reference_value(refAddress, value, this.E);

                // Push the value back on the stack (assignment expressions evaluate to their value)
                this.OS.push(value);
                break;
            }
            case "ENTER_SCOPE": {
                this.RTS.push(this.heap.heap_allocate_Blockframe(this.E));
                const frame_address = this.heap.heap_allocate_Frame(instr.num);
                this.E = this.heap.heap_Environment_extend(frame_address, this.E);
                for (let i = 0; i < instr.num; i++) {
                    this.heap.heap_set_child(frame_address, i, this.heap.Unassigned);
                }
                break;
            }
            case "EXIT_SCOPE": {
                this.E = this.heap.heap_get_Blockframe_environment(this.RTS.pop());
                break;
            }
            case "BINOP": {
                const result = apply_binop(
                    instr.sym,
                    this.OS.pop(),
                    this.OS.pop(),
                    this.heap
                );
                this.OS.push(result);
                break;
            }
            case "UNOP": {
                const result = apply_unop(instr.sym, this.OS.pop(), this.heap);
                this.OS.push(result);
                break;
            }
            case "JOF": {
                this.PC = this.OS.pop() ? this.PC : instr.addr;
                break;
            }
            case "GOTO": {
                this.PC = instr.addr;
                break;
            }
            case "LDF": {
                const closure_address = this.heap.heap_allocate_Closure(
                    instr.arity,
                    instr.addr,
                    this.E
                );
                this.OS.push(closure_address);
                break;
            }
            case "CALL": {
                const arity = instr.arity;
                const fun = this.peek(this.OS, arity);
                
                const new_PC = this.heap.heap_get_Closure_pc(fun);
                const new_frame = this.heap.heap_allocate_Frame(arity);
                for (let i = arity - 1; i >= 0; i--) {
                    this.heap.heap_set_child(new_frame, i, this.OS.pop());
                }

                this.RTS.push(this.heap.heap_allocate_Callframe(this.E, this.PC));
                this.OS.pop(); // pop fun
                
                const closureEnv = this.heap.heap_get_Closure_environment(fun);
                
                this.E = this.heap.heap_Environment_extend(
                    new_frame,
                    closureEnv
                );
                
                this.PC = new_PC;
                break;
            }
            case "RESET": {
                const top_frame = this.RTS.pop();
                if (this.heap.is_Callframe(top_frame)) {
                    this.PC = this.heap.heap_get_Callframe_pc(top_frame);
                    this.E = this.heap.heap_get_Callframe_environment(top_frame);
                } else {
                    this.PC--;
                }
                if (this.OS.length === 0) {
                    this.OS.push(this.heap.Undefined);
                }
                break;
            }
            default:
                throw new Error("Unknown instruction tag: " + instr.tag);
        }
    }

    private peek(array, address) {
        return array.slice(-1 - address)[0];
    }

    private debugVm(currentInstr: Instruction): void {
        console.log(
            `PC: ${this.PC}, Instruction: ${JSON.stringify(currentInstr)}`
        );
        console.log("OS:", this.OS);
        console.log("E:", this.E);
        console.log("RTS:", this.RTS);
    }
}


