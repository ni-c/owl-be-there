import { describe, expect, it, vi } from 'vitest';
import { Observable } from '../src/lib/observable.ts';

/** `set` is protected; this is the smallest subclass that lets a test call it. */
class Cell<S> extends Observable<S> {
  put(next: S): void {
    this.set(next);
  }
}

describe('Observable', () => {
  it('starts out with the initial state, even a falsy one', () => {
    expect(new Cell('first').getState()).toBe('first');
    expect(new Cell(0).getState()).toBe(0);
    expect(new Cell(null).getState()).toBeNull();
  });

  it('tells subscribers, in the order they subscribed, and they read the new state', () => {
    const cell = new Cell(0);
    const seen: string[] = [];
    cell.subscribe(() => seen.push(`a${cell.getState()}`));
    cell.subscribe(() => seen.push(`b${cell.getState()}`));
    cell.put(1);
    cell.put(2);
    expect(seen).toEqual(['a1', 'b1', 'a2', 'b2']);
  });

  it('changes the state when nobody listens', () => {
    const cell = new Cell(0);
    cell.put(5);
    expect(cell.getState()).toBe(5);
  });

  it('stops telling a subscriber that unsubscribed, and only that one', () => {
    const cell = new Cell(0);
    const kept = vi.fn();
    const dropped = vi.fn();
    cell.subscribe(kept);
    const unsubscribe = cell.subscribe(dropped);
    cell.put(1);
    unsubscribe();
    cell.put(2);
    expect(kept).toHaveBeenCalledTimes(2);
    expect(dropped).toHaveBeenCalledTimes(1);
  });

  it('lets a subscriber unsubscribe twice without harm to the others', () => {
    const cell = new Cell(0);
    const first = vi.fn();
    const second = vi.fn();
    const unsubscribeFirst = cell.subscribe(first);
    cell.subscribe(second);
    unsubscribeFirst();
    unsubscribeFirst();
    cell.put(1);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('lets a listener unsubscribe itself while being told, and still tells the rest', () => {
    const cell = new Cell(0);
    const seen: string[] = [];
    const unsubscribe = cell.subscribe(() => {
      seen.push('once');
      unsubscribe();
    });
    cell.subscribe(() => seen.push('always'));
    cell.put(1);
    cell.put(2);
    expect(seen).toEqual(['once', 'always', 'always']);
  });

  it('tells a function subscribed twice once, and forgets it with the first unsubscribe', () => {
    const cell = new Cell(0);
    const listener = vi.fn();
    const unsubscribe = cell.subscribe(listener);
    cell.subscribe(listener);
    cell.put(1);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    cell.put(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('tells subscribers about a set to an identical state', () => {
    const state = { count: 1 };
    const cell = new Cell(state);
    const listener = vi.fn();
    cell.subscribe(listener);
    cell.put(state);
    cell.put({ count: 1 });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(cell.getState()).not.toBe(state);
  });

  it('hands out the same state object until it is set again', () => {
    const cell = new Cell({ count: 1 });
    expect(cell.getState()).toBe(cell.getState());
  });

  it('can be handed on as it is, the way useSyncExternalStore takes it', () => {
    const cell = new Cell(0);
    const { subscribe, getState } = cell;
    const listener = vi.fn();
    const unsubscribe = subscribe(listener);
    cell.put(3);
    expect(getState()).toBe(3);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    cell.put(4);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('keeps two instances apart', () => {
    const one = new Cell('a');
    const two = new Cell('a');
    const listener = vi.fn();
    two.subscribe(listener);
    one.put('b');
    expect(one.getState()).toBe('b');
    expect(two.getState()).toBe('a');
    expect(listener).not.toHaveBeenCalled();
  });
});
