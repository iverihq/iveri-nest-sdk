import { ApiProperty } from '@nestjs/swagger';

import { HealthCheckResultDto } from './health-check-result.dto';

export class StartupResponseDto {
    @ApiProperty({ enum: ['started', 'starting'], example: 'started' })
    status!: 'started' | 'starting';

    @ApiProperty({ type: [HealthCheckResultDto] })
    checks!: HealthCheckResultDto[];
}
