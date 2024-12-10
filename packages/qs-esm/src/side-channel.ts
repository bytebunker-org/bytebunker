export class SideChannel {
    private weakMap: WeakMap<object, any>;

    constructor() {
        this.weakMap = new WeakMap();
    }

    set(key: object, value: any): void {
        this.weakMap.set(key, value);
    }

    get(key: object): any | undefined {
        return this.weakMap.get(key);
    }

    has(key: object): boolean {
        return this.weakMap.has(key);
    }

    assert(key: object): void {
        if (!this.has(key)) {
            throw new Error(`Side channel does not contain the given key.`);
        }
    }
}
