export class AssetCache<T> {
  private readonly values = new Map<string, T>();
  get(id: string): T | undefined { return this.values.get(id); }
  set(id: string, value: T): void { this.values.set(id, value); }
  has(id: string): boolean { return this.values.has(id); }
  delete(id: string): void { this.values.delete(id); }
  clear(): void { this.values.clear(); }
  get size(): number { return this.values.size; }
}
