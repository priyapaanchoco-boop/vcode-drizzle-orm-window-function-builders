import { expect, test } from 'vitest';

import { integer, pgTable, QueryBuilder, text } from '~/pg-core';
import { eq } from '~/sql/expressions/conditions';
import { avg, count, max, min, sum } from '~/sql/functions/aggregate';
import {
	cumeDist,
	denseRank,
	firstValue,
	lag,
	lastValue,
	lead,
	nthValue,
	percentRank,
	rank,
	rowNumber,
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
		'select lag("salary", $1) over (partition by "employees"."department" order by "employees"."id") from "employees"',
	);
	expect(lagQuery.params).toEqual([1]);

	const leadQuery = qb.select({
		next: lead(employees.salary, 2, 0).over({ orderBy: [asc(employees.id), desc(employees.salary)] }),
	}).from(employees).toSQL();
	expect(leadQuery.sql).toBe(
		'select lead("salary", $1, $2) over (order by "employees"."id" asc, "employees"."salary" desc) from "employees"',
	);
	expect(leadQuery.params).toEqual([2, 0]);
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
		'select nth_value("salary", $1) over (partition by "employees"."department" order by "employees"."id") from "employees"',
	);
	expect(nthQuery.params).toEqual([2]);
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
		'select lag("employees"."salary", $1) over (partition by "employees"."department" order by "employees"."id") from "employees" left join "departments" on "employees"."department" = "departments"."name"',
	);
	expect(query.params).toEqual([1]);
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
