export interface Variable {
    name: string;
    isOwned: boolean; // false -> Value is moved, True -> Var still owns some value
    borrow: Borrow.None | Borrow.Immutable | Borrow.Mutable;
    immCount?: number; // number of simultaneous immutable borrows
}

export type Backup = Map<string, { borrow: Variable["borrow"], isOwned: Variable["isOwned"], immCount?: number }>;

export enum Borrow {
    None = "none",
    Immutable = "immutable",
    Mutable = "mutable",
}
  