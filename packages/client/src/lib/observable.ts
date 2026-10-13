/**
 * A state with subscribers, in the shape `useSyncExternalStore` wants:
 * `subscribe` and `getState` are bound, so they can be passed on as they are.
 * Every `set` notifies, equal state or not.
 */
export class Observable<S> {
  protected state: S;
  private readonly listeners = new Set<() => void>();

  constructor(initial: S) {
    this.state = initial;
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  getState = (): S => this.state;

  protected set(next: S): void {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
}
