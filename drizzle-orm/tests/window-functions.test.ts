import { expect, test } from 'vitest';

import * as drizzleOrm from '~/index';
import { integer, pgTable, QueryBuilder, text } from '~/pg-core';
import { gelTable, integer as gelInteger, QueryBuilder as GelQueryBuilder, text as gelText } from '~/gel-core';
import { int as mysqlInt, mysqlTable, QueryBuilder as MySqlQueryBuilder, text as mysqlText } from '~/mysql-core';
import {
	int as singlestoreInt,
	QueryBuilder as SingleStoreQueryBuilder,
	singlestoreTable,
	text as singlestoreText,
} from '~/singlestore-core';
import {
	integer as sqliteInteger,
	QueryBuilder as SQLiteQueryBuilder,
	sqliteTable,
	text as sqliteText,
} from '~/sqlite-core';
import { eq } from '~/sql/expressions/conditions';
import { avg, count, max, min, sum } from '~/sql/functions/aggregate';
import {
	cumeDist,
	currentRow,
	denseRank,
	firstValue,
	following,
	lag,
	lastValue,
	lead,
	nthValue,
	percentRank,
	preceding,
	rank,
	rowNumber,
	unboundedFollowing,
	unboundedPreceding,
} from '~/sql/functions/window';
import { asc, desc } from '~/sql/expressions/select';

const employees = pgTable('employees', {
	id: integer('id'),
	department: text('department'),
	salary: integer('salary'),
});

const departments = pgTable('departments', {
	name: text('name'),
});

const qb = new QueryBuilder();

function selectToSQL(selection: Record<string, unknown>): string {
	return qb.select(selection).from(employees).toSQL().sql;
}

test('row_number with partition by and order by', () => {
	const query = selectToSQL({
		rn: rowNumber().over({ partitionBy: employees.department, orderBy: employees.salary }),
	});
	expect(query).toBe(
		'select row_number() over (partition by "employees"."department" order by "employees"."salary") from "employees"',
	);
});

test('rank, dense_rank, percent_rank and cume_dist', () => {
	expect(
		selectToSQL({ r: rank().over({ orderBy: desc(employees.salary) }) }),
	).toBe('select rank() over (order by "employees"."salary" desc) from "employees"');

	expect(
		selectToSQL({ r: denseRank().over({ orderBy: desc(employees.salary) }) }),
	).toBe('select dense_rank() over (order by "employees"."salary" desc) from "employees"');

	expect(
		selectToSQL({ r: percentRank().over({ orderBy: employees.salary }) }),
	).toBe('select percent_rank() over (order by "employees"."salary") from "employees"');

	expect(
		selectToSQL({ r: cumeDist().over({ orderBy: employees.salary }) }),
	).toBe('select cume_dist() over (order by "employees"."salary") from "employees"');
});

test('lag and lead with offset and default', () => {
	const lagQuery = qb.select({
		prev: lag(employees.salary, 1).over({ partitionBy: employees.department, orderBy: employees.id }),
	}).from(employees).toSQL();
	expect(lagQuery.sql).toBe(
		'select lag("salary", 1) over (partition by "employees"."department" order by "employees"."id") from "employees"',
	);
	expect(lagQuery.params).toEqual([]);

	const leadQuery = qb.select({
		next: lead(employees.salary, 2, 0).over({ orderBy: [asc(employees.id), desc(employees.salary)] }),
	}).from(employees).toSQL();
	expect(leadQuery.sql).toBe(
		'select lead("salary", 2, $1) over (order by "employees"."id" asc, "employees"."salary" desc) from "employees"',
	);
	expect(leadQuery.params).toEqual([0]);
});

test('first_value, last_value and nth_value', () => {
	expect(
		selectToSQL({ v: firstValue(employees.salary).over({ partitionBy: employees.department }) }),
	).toBe(
		'select first_value("salary") over (partition by "employees"."department") from "employees"',
	);

	expect(
		selectToSQL({ v: lastValue(employees.salary).over({ partitionBy: employees.department }) }),
	).toBe(
		'select last_value("salary") over (partition by "employees"."department") from "employees"',
	);

	const nthQuery = qb.select({
		v: nthValue(employees.salary, 2).over({ partitionBy: employees.department, orderBy: employees.id }),
	}).from(employees).toSQL();
	expect(nthQuery.sql).toBe(
		'select nth_value("salary", 2) over (partition by "employees"."department" order by "employees"."id") from "employees"',
	);
	expect(nthQuery.params).toEqual([]);
});

test('aggregate window functions: sum, avg, min, max, count', () => {
	expect(
		selectToSQL({ s: sum(employees.salary).over({ partitionBy: employees.department }) }),
	).toBe(
		'select sum("salary") over (partition by "employees"."department") from "employees"',
	);

	expect(
		selectToSQL({ a: avg(employees.salary).over({ partitionBy: employees.department }) }),
	).toBe(
		'select avg("salary") over (partition by "employees"."department") from "employees"',
	);

	expect(
		selectToSQL({ m: min(employees.salary).over({ partitionBy: employees.department }) }),
	).toBe(
		'select min("salary") over (partition by "employees"."department") from "employees"',
	);

	expect(
		selectToSQL({ m: max(employees.salary).over({ partitionBy: employees.department }) }),
	).toBe(
		'select max("salary") over (partition by "employees"."department") from "employees"',
	);

	expect(
		selectToSQL({ c: count().over({ partitionBy: employees.department }) }),
	).toBe('select count(*) over (partition by "employees"."department") from "employees"');
});

test('over with a named window', () => {
	expect(
		selectToSQL({ r: rowNumber().over('w') }),
	).toBe('select row_number() over "w" from "employees"');
});

test('over with no arguments', () => {
	expect(
		selectToSQL({ s: sum(employees.salary).over() }),
	).toBe('select sum("salary") over () from "employees"');
});

test('partition by accepts multiple columns', () => {
	expect(
		selectToSQL({
			rn: rowNumber().over({ partitionBy: [employees.department, employees.salary] }),
		}),
	).toBe(
		'select row_number() over (partition by "employees"."department", "employees"."salary") from "employees"',
	);
});

test('window functions keep table prefixes when joining', () => {
	const query = qb.select({
		prev: lag(employees.salary, 1).over({ partitionBy: employees.department, orderBy: employees.id }),
	}).from(employees).leftJoin(departments, eq(employees.department, departments.name)).toSQL();
	expect(query.sql).toBe(
		'select lag("employees"."salary", 1) over (partition by "employees"."department" order by "employees"."id") from "employees" left join "departments" on "employees"."department" = "departments"."name"',
	);
	expect(query.params).toEqual([]);
});

test('rows frame between unbounded preceding and current row', () => {
	expect(
		selectToSQL({
			total: sum(employees.salary).over({
				partitionBy: employees.department,
				orderBy: employees.id,
				frame: { mode: 'rows', from: unboundedPreceding(), to: currentRow() },
			}),
		}),
	).toBe(
		'select sum("salary") over (partition by "employees"."department" order by "employees"."id" rows between unbounded preceding and current row) from "employees"',
	);
});

test('frame with preceding and following offsets', () => {
	expect(
		selectToSQL({
			avg: avg(employees.salary).over({
				orderBy: employees.id,
				frame: { mode: 'rows', from: preceding(1), to: following(1) },
			}),
		}),
	).toBe(
		'select avg("salary") over (order by "employees"."id" rows between 1 preceding and 1 following) from "employees"',
	);

	expect(
		selectToSQL({
			total: sum(employees.salary).over({
				orderBy: employees.id,
				frame: { mode: 'range', from: unboundedPreceding(), to: unboundedFollowing() },
			}),
		}),
	).toBe(
		'select sum("salary") over (order by "employees"."id" range between unbounded preceding and unbounded following) from "employees"',
	);
});

test('zero offsets are inlined as literals', () => {
	expect(
		selectToSQL({ v: lag(employees.salary, 0).over({ orderBy: employees.id }) }),
	).toBe('select lag("salary", 0) over (order by "employees"."id") from "employees"');

	expect(
		selectToSQL({
			v: firstValue(employees.salary).over({
				orderBy: employees.id,
				frame: { mode: 'rows', from: preceding(0), to: currentRow() },
			}),
		}),
	).toBe(
		'select first_value("salary") over (order by "employees"."id" rows between 0 preceding and current row) from "employees"',
	);
});

test('count with no expression is count(*)', () => {
	expect(selectToSQL({ c: count() })).toBe('select count(*) from "employees"');
	expect(selectToSQL({ c: count().over() })).toBe('select count(*) over () from "employees"');
});

test('frame bound offsets must be non-negative integers', () => {
	expect(() => preceding(-1)).toThrowError(/preceding.*non-negative integer.*-1/);
	expect(() => preceding(1.5)).toThrowError(/preceding.*non-negative integer.*1\.5/);
	expect(() => following(-2)).toThrowError(/following.*non-negative integer.*-2/);
	expect(() => following(0.5)).toThrowError(/following.*non-negative integer.*0\.5/);
});

test('frame from must not be after to', () => {
	expect(() =>
		rowNumber().over({
			orderBy: employees.id,
			frame: { mode: 'rows', from: currentRow(), to: preceding(1) },
		})
	).toThrowError(/from.*after.*to/);

	expect(() =>
		rowNumber().over({
			orderBy: employees.id,
			frame: { mode: 'rows', from: following(5), to: following(1) },
		})
	).toThrowError(/from.*after.*to/);

	expect(() =>
		rowNumber().over({
			orderBy: employees.id,
			frame: { mode: 'rows', from: unboundedFollowing(), to: unboundedPreceding() },
		})
	).toThrowError(/from.*after.*to/);
});

test('lag, lead and nth_value reject bad numbers', () => {
	expect(() => lag(employees.salary, -1)).toThrowError(/lag.*non-negative integer/);
	expect(() => lead(employees.salary, 1.5)).toThrowError(/lead.*non-negative integer/);
	expect(() => nthValue(employees.salary, -2)).toThrowError(/nthValue.*positive integer/);
	expect(() => nthValue(employees.salary, 0)).toThrowError(/nthValue.*positive integer/);
});

test('select builder window clause with a named reference', () => {
	const query = qb.select({ rn: rowNumber().over('w') }).from(employees)
		.window('w', { partitionBy: employees.department, orderBy: employees.salary })
		.orderBy(employees.id).toSQL();
	expect(query.sql).toBe(
		'select row_number() over "w" from "employees" window "w" as (partition by "employees"."department" order by "employees"."salary") order by "employees"."id"',
	);
});

test('multiple named windows and window frames', () => {
	const query = qb.select({ rn: rowNumber().over('w1'), total: sum(employees.salary).over('w2') })
		.from(employees)
		.window('w1', { partitionBy: employees.department })
		.window('w2', {
			orderBy: employees.id,
			frame: { mode: 'rows', from: unboundedPreceding(), to: currentRow() },
		}).toSQL();
	expect(query.sql).toBe(
		'select row_number() over "w1", sum("salary") over "w2" from "employees" window "w1" as (partition by "employees"."department"), "w2" as (order by "employees"."id" rows between unbounded preceding and current row)',
	);
});

test('window with no spec renders an empty definition', () => {
	expect(
		qb.select({ c: count().over('w') }).from(employees).window('w').toSQL().sql,
	).toBe('select count(*) over "w" from "employees" window "w" as ()');
});

test('window names must be non-empty and not only whitespace', () => {
	expect(() => rowNumber().over('')).toThrowError(/non-empty/);
	expect(() => rowNumber().over('   ')).toThrowError(/whitespace/);
	expect(() => qb.select({ rn: rowNumber().over('w') }).from(employees).window(''))
		.toThrowError(/non-empty/);
	expect(() => qb.select({ rn: rowNumber().over('w') }).from(employees).window('  '))
		.toThrowError(/whitespace/);
});

test('window clause renders in every dialect', () => {
	const mysqlEmployees = mysqlTable('employees', {
		id: mysqlInt('id'),
		department: mysqlText('department'),
	});
	expect(
		new MySqlQueryBuilder().select({ rn: rowNumber().over('w') }).from(mysqlEmployees)
			.window('w', { partitionBy: mysqlEmployees.department }).toSQL().sql,
	).toBe(
		'select row_number() over `w` from `employees` window `w` as (partition by `employees`.`department`)',
	);

	const sqliteEmployees = sqliteTable('employees', {
		id: sqliteInteger('id'),
		department: sqliteText('department'),
	});
	expect(
		new SQLiteQueryBuilder().select({ rn: rowNumber().over('w') }).from(sqliteEmployees)
			.window('w', { partitionBy: sqliteEmployees.department }).toSQL().sql,
	).toBe(
		'select row_number() over "w" from "employees" window "w" as (partition by "employees"."department")',
	);

	const singlestoreEmployees = singlestoreTable('employees', {
		id: singlestoreInt('id'),
		department: singlestoreText('department'),
	});
	expect(
		new SingleStoreQueryBuilder().select({ rn: rowNumber().over('w') }).from(singlestoreEmployees)
			.window('w', { partitionBy: singlestoreEmployees.department }).toSQL().sql,
	).toBe(
		'select row_number() over `w` from `employees` window `w` as (partition by `employees`.`department`)',
	);

	const gelEmployees = gelTable('employees', {
		id: gelInteger('id'),
		department: gelText('department'),
	});
	expect(
		new GelQueryBuilder().select({ rn: rowNumber().over('w') }).from(gelEmployees)
			.window('w', { partitionBy: gelEmployees.department }).toSQL().sql,
	).toBe(
		'select row_number() over "w" from "employees" window "w" as (partition by "employees"."department")',
	);
});

test('window helpers are exported from the main package', () => {
	const helpers = [
		'rowNumber',
		'rank',
		'denseRank',
		'percentRank',
		'cumeDist',
		'lag',
		'lead',
		'firstValue',
		'lastValue',
		'nthValue',
		'unboundedPreceding',
		'preceding',
		'currentRow',
		'following',
		'unboundedFollowing',
	];
	for (const name of helpers) {
		expect(typeof (drizzleOrm as Record<string, unknown>)[name]).toBe('function');
	}
	expect(typeof drizzleOrm.SQL.prototype.over).toBe('function');
});

test('over does not mutate the base expression', () => {
	const base = rowNumber();
	const a = base.over({ partitionBy: employees.department });
	const b = base.over({ orderBy: employees.salary });
	expect(selectToSQL({ a })).toBe(
		'select row_number() over (partition by "employees"."department") from "employees"',
	);
	expect(selectToSQL({ b })).toBe('select row_number() over (order by "employees"."salary") from "employees"');
});
