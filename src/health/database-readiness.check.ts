import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type { HealthCheck } from './health-check.interface';

/**
 * Health check that proves the database is actually reachable.
 *
 * It runs `SELECT 1` rather than reading `dataSource.isInitialized`. The flag stays `true`
 * after the connection drops, so a pool that has lost the database would keep reporting ready
 * and keep receiving traffic — a round trip is the only honest answer.
 *
 * Belongs in both the readiness and startup lists of any service with a database: losing it
 * later must drain traffic, and never having it at boot must fail the container.
 */
@Injectable()
export class DatabaseReadinessCheck implements HealthCheck {
    readonly name = 'database';

    constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

    async check(): Promise<void> {
        await this.dataSource.query('SELECT 1');
    }
}
