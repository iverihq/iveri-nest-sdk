import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type { ReadinessCheck } from './readiness-check.interface';

/**
 * Readiness check that proves the database is actually reachable.
 *
 * It runs `SELECT 1` rather than reading `dataSource.isInitialized`. The flag stays `true`
 * after the connection drops, so a pool that has lost the database would keep reporting ready
 * and keep receiving traffic — a round trip is the only honest answer.
 */
@Injectable()
export class DatabaseReadinessCheck implements ReadinessCheck {
    readonly name = 'database';

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    async check(): Promise<void> {
        await this.dataSource.query('SELECT 1');
    }
}
