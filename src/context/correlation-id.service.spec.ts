import { CorrelationIdService } from './correlation-id.service';

const CORRELATION_ID = 'eeeeeeee-0000-4000-8000-000000000005';

describe('CorrelationIdService', () => {
    let service: CorrelationIdService;

    beforeEach(() => {
        service = new CorrelationIdService();
    });

    it('exposes the id inside a context', () => {
        service.runWith({ correlationId: CORRELATION_ID }, () => {
            expect(service.getCorrelationId()).toBe(CORRELATION_ID);
        });
    });

    it('carries the context across an await boundary', async () => {
        await service.runWith({ correlationId: CORRELATION_ID }, async () => {
            await Promise.resolve();
            await new Promise((resolve) => setTimeout(resolve, 1));

            expect(service.getCorrelationId()).toBe(CORRELATION_ID);
        });
    });

    it('keeps concurrent contexts separate', async () => {
        const observed: string[] = [];

        const run = (id: string, delayMs: number): Promise<void> =>
            service.runWith({ correlationId: id }, async () => {
                await new Promise((resolve) => setTimeout(resolve, delayMs));
                observed.push(service.getCorrelationId() ?? 'lost');
            });

        // The slower request finishes second; if the store leaked between them it would
        // report the other's id.
        await Promise.all([run('slow', 10), run('fast', 1)]);

        expect(observed).toEqual(['fast', 'slow']);
    });

    it('returns undefined outside any context', () => {
        expect(service.getCorrelationId()).toBeUndefined();
        expect(service.getContext()).toBeUndefined();
    });

    it('generates an id outside a context rather than throwing', () => {
        expect(service.getCorrelationIdOrGenerate()).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('prefers the context id over generating one', () => {
        service.runWith({ correlationId: CORRELATION_ID }, () => {
            expect(service.getCorrelationIdOrGenerate()).toBe(CORRELATION_ID);
        });
    });

    it('merges log fields into the active context', () => {
        service.runWith({ correlationId: CORRELATION_ID, fields: { tenantId: 'a' } }, () => {
            service.addFields({ userId: 'b' });

            expect(service.getContext()?.fields).toEqual({ tenantId: 'a', userId: 'b' });
        });
    });

    it('ignores added fields outside a context instead of throwing', () => {
        expect(() => {
            service.addFields({ tenantId: 'a' });
        }).not.toThrow();
    });

    it('shares one store across instances so context survives a module boundary', () => {
        const other = new CorrelationIdService();

        service.runWith({ correlationId: CORRELATION_ID }, () => {
            expect(other.getCorrelationId()).toBe(CORRELATION_ID);
        });
    });
});
