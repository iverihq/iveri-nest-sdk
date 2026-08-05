import { ApiProperty } from '@nestjs/swagger';

export class LivenessResponseDto {
    @ApiProperty({ enum: ['ok'], example: 'ok' })
    status!: 'ok';
}
