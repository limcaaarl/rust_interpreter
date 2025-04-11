import { displayInstructions } from "./compiler/CompilerHelper";
import { Instruction } from "./compiler/Instruction";
import { pair, Pair, extend, lookup, assign_value, UNASSIGNED, apply_binop, apply_unop, head, tail } from "./Utils";
import { TAGS } from "./NodeTags";

export class VirtualMachine {
    // Frames are objects that map symbols (strings) to values.
    private global_frame: any = {};

    // An environment is null or a pair whose head is a frame
    // and whose tail is an environment.
    private empty_environment: Pair = null;
    private global_environment: Pair = pair(
        this.global_frame,
        this.empty_environment
    );

    // VM Registers
    private PC: number = 0;
    private OS: any[] = [];
    private E: Pair = this.global_environment;
    private RTS: any[] = [];
    private instr: Instruction[];

    // VM Heap Management
    private ALLOCATING: any[];
    private HEAP_BOTTOM: any;
    private HEAP: any;
    private heap_size: number;
    private node_size: number = 10;
    private size_offset: number = 5;
    private free: any;
    private word_size: number = 8;
    private mark_bit: number = 7;
    private UNMARKED: number = 0;
    private MARKED: number = 1;

    constructor(instructions: Instruction[]) {
        this.instr = instructions;
    }

    private init(heapsize_words: number) {
        // this.OS = []
        // this.PC = 0
        // this.RTS = []

        this.ALLOCATING = [];

        this.HEAP_BOTTOM = undefined; // the initial bottom is unknown

        this.HEAP = this.heap_make(heapsize_words);
        this.heap_size = heapsize_words;
        // initialize free list:
        // every free node carries the address
        // of the next free node as its first word
        let i = 0;
        for (
            i = 0;
            i <= heapsize_words - this.node_size;
            i = i + this.node_size
        ) {
            this.heap_set(i, i + this.node_size);
        }
        // the empty free list is represented by -1
        this.heap_set(i - this.node_size, -1);
        this.free = 0;
        this.PC = 0;
        this.allocate_literal_values();

        // TODO: Builtins and constants
        // const builtins_frame = this.allocate_builtin_frame();
        // const constants_frame = this.allocate_constant_frame();
        this.E = this.heap_allocate_Environment(0);
        // this.E = this.heap_Environment_extend(builtins_frame, this.E);
        // this.E = this.heap_Environment_extend(constants_frame, this.E);
        // modified
        this.HEAP_BOTTOM = this.free;
    }

    // runs the machine code instructions
    public run(): any {
        this.init(10000);
        // displayInstructions(this.instr);
        while (this.instr[this.PC].tag !== "DONE") {
            const currentInstr = this.instr[this.PC++];
            // this.debugVm(currentInstr);
            this.microcode(currentInstr);
        }
        return this.peek(this.OS, 0);
        // console.log(this.peek(this.OS, 0))
        // return this.address_to_JS_value(this.peek(this.OS, 0));
    }

    // TODO: Implement all the necessary instructions
    private microcode(instr: Instruction): void {
        switch (instr.tag) {
            case "POP":
                this.OS.pop();
                break;
            case "LDC":
                this.OS.push(instr.val);
                // this.OS.push(this.JS_value_to_address(instr.val));
                break;
            case "LD": {
                const val = this.heap_get_Environment_value(this.E, instr.pos);
                if (this.is_Unassigned(val)) {
                    throw new Error("unassigned name: " + instr.sym);
                }
                this.OS.push(val);
                break;
            }
            case "ASSIGN":
                this.heap_set_Environment_value(
                    this.E,
                    instr.pos,
                    this.peek(this.OS, 0)
                );
                break;
            case "ENTER_SCOPE":
                this.RTS.push(this.heap_allocate_Blockframe(this.E));
                const frame_address = this.heap_allocate_Frame(instr.num);
                this.E = this.heap_Environment_extend(frame_address, this.E);
                for (let i = 0; i < instr.num; i++) {
                    this.heap_set_child(frame_address, i, this.Unassigned);
                }
                break;
            case "EXIT_SCOPE":
                this.E = this.heap_get_Blockframe_environment(this.RTS.pop());
                break;
            case "BINOP": {
                const result = apply_binop(
                    instr.sym,
                    this.OS.pop(),
                    this.OS.pop()
                );
                this.OS.push(result);
                break;
            }
            case "UNOP": {
                const result = apply_unop(instr.sym, this.OS.pop());
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
                const closure_address = this.heap_allocate_Closure(
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
                // if (is_Builtin(fun)) {
                //     return apply_builtin(heap_get_Builtin_id(fun))
                // }
                const new_PC = this.heap_get_Closure_pc(fun);
                const new_frame = this.heap_allocate_Frame(arity);
                for (let i = arity - 1; i >= 0; i--) {
                    this.heap_set_child(new_frame, i, this.OS.pop());
                }

                this.ALLOCATING = [new_frame];
                this.RTS.push(this.heap_allocate_Callframe(this.E, this.PC));
                this.OS.pop(); // pop fun
                this.E = this.heap_Environment_extend(
                    new_frame,
                    this.heap_get_Closure_environment(fun)
                );
                this.PC = new_PC;
                break;
            }
            case "RESET": {
                const top_frame = this.RTS.pop();
                if (this.is_Callframe(top_frame)) {
                    this.PC = this.heap_get_Callframe_pc(top_frame);
                    this.E = this.heap_get_Callframe_environment(top_frame);
                } else {
                    this.PC--;
                }
                break;
            }
            default:
                throw new Error("Unknown instruction tag: " + instr.tag);
        }
    }

    private mark_sweep() {
        // mark r for r in roots
        const roots = [
            this.True,
            this.False,
            this.Undefined,
            this.Unassigned,
            this.Null,
            ...this.OS,
            this.E,
            ...this.RTS,
            ...this.ALLOCATING,
        ];
        for (let i = 0; i < roots.length; i++) {
            this.mark(roots[i]);
        }

        this.sweep();

        if (this.free === -1) {
            throw new Error("heap memory exhausted");
        }
    }

    private mark(node) {
        if (node >= this.heap_size) {
            return;
        }

        if (this.is_unmarked(node)) {
            this.heap_set_byte_at_offset(node, this.mark_bit, this.MARKED);

            const num_of_children = this.heap_get_number_of_children(node);

            for (let i = 0; i < num_of_children; i++) {
                this.mark(this.heap_get_child(node, i));
            }
        }
    }

    private sweep() {
        let v = this.HEAP_BOTTOM;

        while (v < this.heap_size) {
            if (this.is_unmarked(v)) {
                this.free_node(v);
            } else {
                this.heap_set_byte_at_offset(v, this.mark_bit, this.UNMARKED);
            }

            v = v + this.node_size;
        }
    }

    private is_unmarked(node) {
        return (
            this.heap_get_byte_at_offset(node, this.mark_bit) === this.UNMARKED
        );
    }

    private free_node(node) {
        // heap set is used for retrieving the next free node
        this.heap_set(node, this.free);
        this.free = node;
    }

    // some unused functions

    // private heap_already_copied(node) {
    //     this.heap_get_forwarding_address(node) >= this.to_space &&
    //         this.heap_get_forwarding_address(node) <= this.free;
    // }

    // private heap_set_forwarding_address(node, address) {
    //     this.HEAP.setInt32(node * this.word_size, address);
    // }

    // private heap_get_forwarding_address(node) {
    //     return this.HEAP.getInt32(node * this.word_size);
    // }

    private heap_get(address: number) {
        return this.HEAP.getFloat64(address * this.word_size);
    }

    private heap_set(address: number, x: any) {
        return this.HEAP.setFloat64(address * this.word_size, x);
    }

    private heap_get_child(address: number, child_index: number) {
        return this.heap_get(address + 1 + child_index);
    }

    private heap_set_child(address: number, child_index: number, value) {
        return this.heap_set(address + 1 + child_index, value);
    }

    private heap_get_tag(address: number) {
        return this.HEAP.getInt8(address * this.word_size);
    }

    private heap_get_size(address: number) {
        return this.HEAP.getUint16(address * this.word_size + this.size_offset);
    }

    private heap_get_number_of_children(address: number): number {
        if (this.heap_get_tag(address) === TAGS.Number_tag) {
            return 0;
        } else {
            return this.heap_get_size(address) - 1;
        }
    }

    private heap_set_byte_at_offset(
        address: number,
        offset: number,
        value: number
    ): void {
        this.HEAP.setUint8(address * this.word_size + offset, value);
    }

    private heap_get_byte_at_offset(address: number, offset: number): number {
        return this.HEAP.getUint8(address * this.word_size + offset);
    }

    private heap_set_2_bytes_at_offset(
        address: number,
        offset: number,
        value: number
    ): void {
        this.HEAP.setUint16(address * this.word_size + offset, value);
    }

    private heap_get_2_bytes_at_offset(
        address: number,
        offset: number
    ): number {
        return this.HEAP.getUint16(address * this.word_size + offset);
    }

    private word_to_string(word): string {
        const buf = new ArrayBuffer(8);
        const view = new DataView(buf);
        view.setFloat64(0, word);
        let binStr = "";
        for (let i = 0; i < 8; i++) {
            binStr +=
                ("00000000" + view.getUint8(i).toString(2)).slice(-8) + " ";
        }
        return binStr;
    }

    private False;
    private is_False = (address) =>
        this.heap_get_tag(address) === TAGS.False_tag;
    private True;
    private is_True(address) {
        return this.heap_get_tag(address) === TAGS.True_tag;
    }

    private is_Boolean(address) {
        return this.is_True(address) || this.is_False(address);
    }

    private Null;
    private is_Null(address) {
        return this.heap_get_tag(address) === TAGS.Null_tag;
    }

    private Unassigned;
    private is_Unassigned(address) {
        return this.heap_get_tag(address) === TAGS.Unassigned_tag;
    }

    private Undefined;
    private is_Undefined(address) {
        return this.heap_get_tag(address) === TAGS.Undefined_tag;
    }

    private allocate_literal_values() {
        this.False = this.heap_allocate(TAGS.False_tag, 1);
        this.True = this.heap_allocate(TAGS.True_tag, 1);
        this.Null = this.heap_allocate(TAGS.Null_tag, 1);
        this.Unassigned = this.heap_allocate(TAGS.Unassigned_tag, 1);
        this.Undefined = this.heap_allocate(TAGS.Undefined_tag, 1);
    }

    private is_Builtin(address) {
        return this.heap_get_tag(address) === TAGS.Builtin_tag;
    }

    private heap_allocate_Builtin(id) {
        const address = this.heap_allocate(TAGS.Builtin_tag, 1);
        this.heap_set_byte_at_offset(address, 1, id);
        return address;
    }

    private heap_get_Builtin_id(address) {
        return this.heap_get_byte_at_offset(address, 1);
    }

    // Closure-related functions
    private heap_allocate_Closure(arity: number, pc: number, env: any): number {
        const address = this.heap_allocate(TAGS.Closure_tag, 2);
        this.heap_set_byte_at_offset(address, 1, arity);
        this.heap_set_2_bytes_at_offset(address, 2, pc);
        this.heap_set(address + 1, env);
        return address;
    }

    private heap_get_Closure_arity(address: number): number {
        return this.heap_get_byte_at_offset(address, 1);
    }

    private heap_get_Closure_pc(address: number): number {
        return this.heap_get_2_bytes_at_offset(address, 2);
    }

    private heap_get_Closure_environment(address: number): number {
        return this.heap_get_child(address, 0);
    }

    private is_Closure(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Closure_tag;
    }

    // Blockframe-related functions
    private heap_allocate_Blockframe(env: any): number {
        const address = this.heap_allocate(TAGS.Blockframe_tag, 2);
        this.heap_set(address + 1, env);
        return address;
    }

    private heap_get_Blockframe_environment(address: number) {
        return this.heap_get_child(address, 0);
    }

    private is_Blockframe(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Blockframe_tag;
    }

    // Callframe-related functions
    private heap_allocate_Callframe(env: any, pc: number): number {
        const address = this.heap_allocate(TAGS.Callframe_tag, 2);
        this.heap_set_2_bytes_at_offset(address, 2, pc);
        this.heap_set(address + 1, env);
        return address;
    }

    private heap_get_Callframe_environment(address: number) {
        return this.heap_get_child(address, 0);
    }

    private heap_get_Callframe_pc(address: number): number {
        return this.heap_get_2_bytes_at_offset(address, 2);
    }

    private is_Callframe(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Callframe_tag;
    }

    // Frame-related functions
    private heap_allocate_Frame(number_of_values: number): number {
        return this.heap_allocate(TAGS.Frame_tag, number_of_values + 1);
    }

    private heap_Frame_display(address: number): void {
        console.log("", "Frame:");
        const size = this.heap_get_number_of_children(address);
        for (let i = 0; i < size; i++) {
            const value = this.heap_get_child(address, i);
        }
    }

    // Environment-related functions
    private heap_allocate_Environment(number_of_frames: number) {
        return this.heap_allocate(TAGS.Environment_tag, number_of_frames + 1);
    }

    private heap_get_Environment_value(
        env_address: any,
        position: [number, number]
    ): number {
        const [frame_index, value_index] = position;
        const frameCount = this.heap_get_number_of_children(env_address);
        if (frame_index >= frameCount) {
            throw new Error("unbound name: variable not in environment");
        }
        const frame_address = this.heap_get_child(env_address, frame_index);
        return this.heap_get_child(frame_address, value_index);
    }

    private heap_set_Environment_value(
        env_address: any,
        position: [number, number],
        value: number
    ): void {
        const [frame_index, value_index] = position;
        const frame_address = this.heap_get_child(env_address, frame_index);
        this.heap_set_child(frame_address, value_index, value);
    }

    private heap_Environment_extend(frame_address: number, env_address: any) {
        const old_size = this.heap_get_size(env_address);

        this.ALLOCATING = [...this.ALLOCATING, frame_address, env_address];
        const new_env_address = this.heap_allocate_Environment(old_size);
        this.ALLOCATING = [];

        let i: number;
        for (i = 0; i < old_size - 1; i++) {
            this.heap_set_child(
                new_env_address,
                i,
                this.heap_get_child(env_address, i)
            );
        }
        this.heap_set_child(new_env_address, i, frame_address);

        return new_env_address;
    }

    private heap_Environment_display(env_address: any): void {
        const size = this.heap_get_number_of_children(env_address);
        console.log("", "Environment:");

        for (let i = 0; i < size; i++) {
            const frame = this.heap_get_child(env_address, i);
            this.heap_Frame_display(frame);
        }
    }

    private heap_allocate_Pair(hd: number, tl: number): number {
        const pair_address = this.heap_allocate(TAGS.Pair_tag, 3);
        this.heap_set_child(pair_address, 0, hd);
        this.heap_set_child(pair_address, 1, tl);
        return pair_address;
    }

    private is_Pair(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Pair_tag;
    }

    private heap_allocate_Number(n: number): number {
        const number_address = this.heap_allocate(TAGS.Number_tag, 2);
        this.heap_set(number_address + 1, n);
        return number_address;
    }

    private is_Number(address: number): boolean {
        return this.heap_get_tag(address) === TAGS.Number_tag;
    }

    // TODO: Not sure if we need to follow source's implementation of address_to_JS_value and JS_value_to_address
    // Our previous implementation already works without this.
    private address_to_JS_value = (x: any): any =>
        this.is_Boolean(x)
            ? this.is_True(x)
                ? true
                : false
            : this.is_Number(x)
            ? this.heap_get(x + 1)
            : this.is_Undefined(x)
            ? undefined
            : this.is_Unassigned(x)
            ? "<unassigned>"
            : this.is_Null(x)
            ? null
            : this.is_Pair(x)
            ? [
                  this.address_to_JS_value(this.heap_get_child(x, 0)),
                  this.address_to_JS_value(this.heap_get_child(x, 1)),
              ]
            : this.is_Closure(x)
            ? "<closure>"
            : this.is_Builtin(x)
            ? "<builtin>"
            : "unknown word tag: " + this.word_to_string(x);
    

    private is_boolean(x: any): x is boolean {
        return typeof x === "boolean";
    }

    private is_number(x: any): x is number {
        return typeof x === "number";
    }

    private is_undefined(x: any): x is undefined {
        return typeof x === "undefined";
    }

    private is_null(x: any): x is null {
        return x === null;
    }

    private is_string(x: any): x is string {
        return typeof x === "string";
    }

    // You should also create something like this if you work with pairs:
    private is_pair(x: any): boolean {
        // Depending on how a pair is represented in your code,
        // implement this check. For example, if pairs are arrays of length 2:
        return Array.isArray(x) && x.length === 2;
    }

    // Assume head and tail are defined appropriately:
    private head(pair: [any, any]): any {
        return pair[0];
    }

    private tail(pair: [any, any]): any {
        return pair[1];
    }
    private JS_value_to_address(x: any): any {
        if (this.is_boolean(x)) {
            return x ? this.True : this.False;
        } else if (this.is_number(x)) {
            return this.heap_allocate_Number(x);
        } else if (this.is_undefined(x)) {
            return this.Undefined;
        } else if (this.is_null(x)) {
            return this.Null;
        } else if (this.is_pair(x)) {
            return this.heap_allocate_Pair(
                this.JS_value_to_address(this.head(x)),
                this.JS_value_to_address(this.tail(x))
            );
        } else {
            return "unknown word tag: " + this.word_to_string(x);
        }
    }

    private heap_make(words: number) {
        const data = new ArrayBuffer(words * this.word_size);
        const view = new DataView(data);
        return view;
    }

    // private constants = {
    //     undefined     : Undefined,
    //     math_E        : math_E,
    //     math_LN10     : math_LN10,
    //     math_LN2      : math_LN2,
    //     math_LOG10E   : math_LOG10E,
    //     math_LOG2E    : math_LOG2E,
    //     math_PI       : math_PI,
    //     math_SQRT1_2  : math_SQRT1_2,
    //     math_SQRT2    : math_SQRT2
    // }

    // private allocate_constant_frame() {
    //     const constant_values = Object.values(constants)
    //     const frame_address =
    //             this.heap_allocate_Frame(constant_values.length)
    //     for (let i = 0; i < constant_values.length; i++) {
    //         const constant_value = constant_values[i];
    //         if (typeof constant_value === "undefined") {
    //             this.heap_set_child(frame_address, i, this.Undefined)
    //         } else {
    //             this.heap_set_child(
    //                 frame_address,
    //                 i,
    //                 this.heap_allocate_Number(constant_value))
    //         }
    //     }
    //     return frame_address
    // }

    // TODO: Currently added some random builtins...
    // not having these frames for builtin and constant was causing some bug where
    // the pos generated from compiler doesnt match the frame index in vm

    private allocate_builtin_frame(): number {
        const builtins = [];
        const frame_address = this.heap_allocate_Frame(builtins.length);
    
        for (let i = 0; i < builtins.length; i++) {
            const builtinAddr = this.heap_allocate_Builtin(i /* or ID */);
            this.heap_set_child(frame_address, i, builtinAddr);
        }
        return frame_address;
    }

    private allocate_constant_frame(): number {
        const constantsMap = {};
        const keys = Object.keys(constantsMap);
        const frame_address = this.heap_allocate_Frame(keys.length);
    
        for (let i = 0; i < keys.length; i++) {
            // For a numeric constant, allocate a number node
            const numericAddr = this.heap_allocate_Number(constantsMap[keys[i]]);
            this.heap_set_child(frame_address, i, numericAddr);
        }
        return frame_address;
    }
    
    

    private heap_allocate(tag: any, size: number) {
        if (size > this.node_size) {
            throw new Error("limitation: nodes cannot be larger than 10 words");
        }
        // a value of -1 in free indicates the
        // end of the free list
        if (this.free === -1) {
            this.mark_sweep();
        }

        // allocate
        const address = this.free;
        this.free = this.heap_get(this.free);
        this.HEAP.setInt8(address * this.word_size, tag);
        this.HEAP.setUint16(address * this.word_size + this.size_offset, size);
        return address;
    }

    // private peek(): any {
    //     return this.OS[this.OS.length - 1];
    // }

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

    private binop_microcode: { [op: string]: (x: any, y: any) => any } = {
        "+": (x: string | number, y: string | number) => {
            if (this.is_number(x) && this.is_number(y)) {
                return x + y; // TS now sees both as numbers
            } else if (this.is_string(x) && this.is_string(y)) {
                return x + y; // TS now sees both as strings
            } else {
                new Error(
                    "+ expects two numbers or two strings, got: " + x + ", " + y
                );
            }
        },
        "*": (x, y) => x * y,
        "-": (x, y) => x - y,
        "/": (x, y) => x / y,
        "%": (x, y) => x % y,
        "<": (x, y) => x < y,
        "<=": (x, y) => x <= y,
        ">=": (x, y) => x >= y,
        ">": (x, y) => x > y,
        "===": (x, y) => x === y,
        "!==": (x, y) => x !== y,
    };
    // v2 is popped before v1
    private apply_binop(op, v2, v1) {
        return this.JS_value_to_address(
            this.binop_microcode[op](
                this.address_to_JS_value(v1),
                this.address_to_JS_value(v2)
            )
        );
    }

    private unop_microcode = {
        "-unary": (x) => -x,
        "!": (x) => !x,
    };

    private apply_unop(op, v) {
        return this.JS_value_to_address(
            this.unop_microcode[op](this.address_to_JS_value(v))
        );
    }
}


