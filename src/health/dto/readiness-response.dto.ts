import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ReadinessCheckResultDto {
    @ApiProperty({ example: 'database' })
    name!: string;

    @ApiProperty({ enum: ['up', 'down'], example: 'up' })
    status!: 'up' | 'down';

    @ApiPropertyOptional({ example: 'connection refused' })
    error?: string;
}

export class ReadinessResponseDto {
    @ApiProperty({ enum: ['ready', 'not_ready'], example: 'ready' })
    status!: 'ready' | 'not_ready';

    @ApiProperty({ type: [ReadinessCheckResultDto] })
    checks!: ReadinessCheckResultDto[];
}
