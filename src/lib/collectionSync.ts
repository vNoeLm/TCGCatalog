/**
 * Deciding what happens when a browser's collection and the one saved in the cloud disagree.
 *
 * The old rule kept the higher count of each card from either side. That can never delete
 * anything: reset a collection, or lower a count, and the next sign-in finds the old higher number
 * in the cloud and brings it straight back. So instead each side carries the time it was last
 * changed, and the more recent side wins outright.
 *
 * A browser that has never synced this way has no time of its own. That is the case for everyone
 * on the day this ships, and for a fresh browser, and there the two sides are combined the way they
 * always were so that nothing anyone has already saved is lost.
 */

export type Collection = Record<string, number>;

export type CollectionSyncDecision =
  /** Already the same; nothing to do. */
  | { action: 'none' }
  /** The cloud copy is the newer one: replace this browser's with it. */
  | { action: 'use-cloud'; collection: Collection }
  /** This browser's copy is the newer one: save it to the cloud, even when it is empty. */
  | { action: 'push-local' }
  /** Neither has a time to go by: keep the higher count of each card, then save that. */
  | { action: 'merge'; collection: Collection };

const isEmpty = (c: Collection) => Object.keys(c).length === 0;

export function sameCollection(a: Collection, b: Collection): boolean {
  const aKeys = Object.keys(a);
  if (aKeys.length !== Object.keys(b).length) return false;
  return aKeys.every((key) => a[key] === b[key]);
}

export function unionMax(a: Collection, b: Collection): Collection {
  const merged: Collection = { ...a };
  for (const [key, count] of Object.entries(b)) {
    if ((merged[key] || 0) < count) merged[key] = count;
  }
  return merged;
}

const time = (stamp: string | null) => (stamp ? Date.parse(stamp) : NaN);

export function resolveCollectionSync(input: {
  local: Collection;
  /** When this browser's copy was last changed or synced, or null if it never has been. */
  localStamp: string | null;
  cloud: Collection;
  /** When the cloud copy was last saved, or null if there is none. */
  cloudStamp: string | null;
}): CollectionSyncDecision {
  const { local, localStamp, cloud, cloudStamp } = input;

  if (sameCollection(local, cloud)) return { action: 'none' };

  // No time of its own: a fresh browser, or one that has not synced since timestamps were added.
  if (!Number.isFinite(time(localStamp))) {
    if (isEmpty(local)) return { action: 'use-cloud', collection: cloud };
    if (isEmpty(cloud)) return { action: 'push-local' };
    return { action: 'merge', collection: unionMax(local, cloud) };
  }

  // Both have a time: whoever changed last wins, including a deliberate reset to nothing.
  if (Number.isFinite(time(cloudStamp)) && time(cloudStamp) > time(localStamp)) {
    return { action: 'use-cloud', collection: cloud };
  }
  return { action: 'push-local' };
}
