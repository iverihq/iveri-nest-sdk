/**
 * The four states a durable publish intent can be in.
 *
 * The wire values are the ones already stored by every service that had its own copy of this
 * enum, and they appear verbatim in each table's `CHECK` constraint. **Do not reword one.** A
 * value TypeORM cannot see is a value no migration will fix for you: the constraint would start
 * refusing rows the code still writes, and the first symptom is a publish failing at insert.
 */
export enum OutboxEventStatus {
    PENDING = 'pending',
    PROCESSING = 'processing',
    PUBLISHED = 'published',
    DEAD_LETTER = 'dead-letter',
}
