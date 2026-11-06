import { ApiProperty } from '@nestjs/swagger';

import { HealthCheckResultDto } from './health-check-result.dto.js';

export class ReadinessResponseDto {
    @ApiProperty({ enum: ['ready', 'not_ready'], example: 'ready' })
    status!: 'ready' | 'not_ready';

    @ApiProperty({ type: [HealthCheckResultDto] })
    checks!: HealthCheckResultDto[];
}
