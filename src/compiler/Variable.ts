export interface VariableInfo {
    name: string;
    ownsVal: boolean; // false -> Value is moved, True -> Var still owns some value
    borrow: Borrow.None | Borrow.Immutable | Borrow.Mutable;
    immCount?: number; // number of simultaneous immutable borrows
}

export type Backup = Map<string, { borrow: VariableInfo["borrow"], ownsVal: VariableInfo["ownsVal"], immCount?: number }>;

export enum Borrow {
    None = "none",
    Immutable = "immutable",
    Mutable = "mutable",
}
  