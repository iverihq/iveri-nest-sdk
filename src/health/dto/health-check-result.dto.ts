import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Per-dependency outcome, shared by the readiness and startup responses. */
export class HealthCheckResultDto {
    @ApiProperty({ example: 'database' })
    name!: string;

    @ApiProperty({ enum: ['up', 'down'], example: 'up' })
    status!: 'up' | 'down';

    @ApiPropertyOptional({ example: 'connection refused' })
    error?: string;
}
