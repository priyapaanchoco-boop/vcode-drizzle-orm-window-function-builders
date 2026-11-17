import { Expect } from 'type-tests/utils.ts';
import { integer, pgTable } from '~/pg-core/index.ts';
import { firstValue, lag, lastValue, lead, nthValue } from '~/sql/functions/window.ts';
import type { SQL } from '~/sql/sql.ts';
import type { Equal } from '~/utils.ts';

const employees = pgTable('employees', {
	id: integer('id').notNull(),
	salary: integer('salary'),
});

const lagNoDefault = lag(employees.id);
const lagOffsetOnly = lag(employees.id, 1);
const lagWithDefault = lag(employees.id, 1, 0);
const lagNullableWithDefault = lag(employees.salary, 1, 0);
const leadNoDefault = lead(employees.id);
const leadWithDefault = lead(employees.id, 1, 0);
const first = firstValue(employees.id);
const last = lastValue(employees.id);
const nth = nthValue(employees.id, 2);
const lagOver = lag(employees.id, 1, 0).over({ orderBy: employees.id });

Expect<Equal<SQL<number | null>, typeof lagNoDefault>>;

Expect<Equal<SQL<number | null>, typeof lagOffsetOnly>>;

Expect<Equal<SQL<number>, typeof lagWithDefault>>;

Expect<Equal<SQL<number | null>, typeof lagNullableWithDefault>>;

Expect<Equal<SQL<number | null>, typeof leadNoDefault>>;

Expect<Equal<SQL<number>, typeof leadWithDefault>>;

Expect<Equal<SQL<number | null>, typeof first>>;

Expect<Equal<SQL<number | null>, typeof last>>;

Expect<Equal<SQL<number | null>, typeof nth>>;

Expect<Equal<SQL<number>, typeof lagOver>>;
