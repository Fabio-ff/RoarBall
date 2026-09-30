// structuredClone is a standard JS global (WinterCG minimum common API) that TypeScript only
// declares in lib.dom / @types/node. Declare it here so the simulation typechecks with
// tsconfig.sim.json (ES2022 lib only, no DOM, no node).
declare function structuredClone<T>(value: T): T;
