import { type AnyColumn, Column, type GetColumnData } from '~/column.ts';
import { is } from '~/entity.ts';
import { bindIfParam } from '../expressions/conditions.ts';
import { type SQL, sql, type SQLWrapper, WindowFrameBound } from '../sql.ts';

function assertNonNegativeInteger(helper: string, arg: string, value: number): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new Error(`${helper}() ${arg} must be a non-negative integer, but got ${String(value)}`);
	}
}

/**
 * Returns the number of the current row within its partition, starting at 1.
 *
 * Unlike {@link rank} and {@link denseRank}, rows with equal `orderBy` values always
 * get distinct numbers.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Number employees within each department by salary
 * db.select({
 * 	rowNumber: rowNumber().over({ partitionBy: employees.department, orderBy: employees.salary }),
 * }).from(employees);
 * ```
 *
 * @see rank for competition ranking with gaps
 * @see denseRank for dense ranking without gaps
 */
export function rowNumber(): SQL<number> {
	return sql`row_number()`.mapWith(Number);
}

/**
 * Returns the rank of the current row within its partition, starting at 1. Rows with
 * equal `orderBy` values share a rank, and the next rank is skipped (1, 2, 2, 4).
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Rank employees by salary, sharing ranks on ties
 * db.select({ rank: rank().over({ orderBy: desc(employees.salary) }) }).from(employees);
 * ```
 *
 * @see denseRank for ranking without gaps after ties
 * @see rowNumber for unique numbers even on ties
 */
export function rank(): SQL<number> {
	return sql`rank()`.mapWith(Number);
}

/**
 * Returns the rank of the current row within its partition, starting at 1. Rows with
 * equal `orderBy` values share a rank, and no ranks are skipped (1, 2, 2, 3).
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Rank employees by salary, with no gaps after ties
 * db.select({ rank: denseRank().over({ orderBy: desc(employees.salary) }) }).from(employees);
 * ```
 *
 * @see rank for competition ranking with gaps
 * @see rowNumber for unique numbers even on ties
 */
export function denseRank(): SQL<number> {
	return sql`dense_rank()`.mapWith(Number);
}

/**
 * Returns the relative rank of the current row within its partition, as a number
 * between 0 and 1: `(rank - 1) / (partition row count - 1)`.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Relative standing of each employee's salary
 * db.select({ pct: percentRank().over({ orderBy: employees.salary }) }).from(employees);
 * ```
 *
 * @see cumeDist for the cumulative distribution of the current row
 */
export function percentRank(): SQL<number> {
	return sql`percent_rank()`.mapWith(Number);
}

/**
 * Returns the cumulative distribution of the current row within its partition, as a
 * number between 0 and 1: `(rows preceding or tied with the current row) / (partition row count)`.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Share of employees earning no more than each employee
 * db.select({ cume: cumeDist().over({ orderBy: employees.salary }) }).from(employees);
 * ```
 *
 * @see percentRank for the relative rank of the current row
 */
export function cumeDist(): SQL<number> {
	return sql`cume_dist()`.mapWith(Number);
}

/**
 * Returns the value of `expression` on the row `offset` rows before the current row
 * within the partition, or `defaultValue` (default `null`) when there is no such row.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Previous salary within each department, defaulting to 0
 * db.select({
 * 	prevSalary: lag(employees.salary, 1, 0).over({ partitionBy: employees.department, orderBy: employees.id }),
 * }).from(employees);
 * ```
 *
 * @see lead to look at following rows instead
 */
export function lag<T extends SQLWrapper>(
	expression: T,
	offset?: number,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null>;
/**
 * When `defaultValue` is provided, the result keeps the expression's own type without the added
 * `null`.
 */
export function lag<T extends SQLWrapper>(
	expression: T,
	offset: number | undefined,
	defaultValue: T extends AnyColumn ? T['_']['data'] | SQLWrapper : unknown,
): SQL<T extends AnyColumn ? GetColumnData<T, 'query'> : string>;
export function lag<T extends SQLWrapper>(
	expression: T,
	offset?: number,
	defaultValue?: T extends AnyColumn ? T['_']['data'] | SQLWrapper : unknown,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	let fn: SQL;
	if (offset === undefined) {
		fn = sql`lag(${expression})`;
	} else {
		assertNonNegativeInteger('lag', 'offset', offset);
		const inlineOffset = sql.raw(String(offset));
		fn = defaultValue === undefined
			? sql`lag(${expression}, ${inlineOffset})`
			: sql`lag(${expression}, ${inlineOffset}, ${bindIfParam(defaultValue, expression)})`;
	}
	return fn.mapWith(is(expression, Column) ? expression : String) as any;
}

/**
 * Returns the value of `expression` on the row `offset` rows after the current row
 * within the partition, or `defaultValue` (default `null`) when there is no such row.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Next salary within each department
 * db.select({
 * 	nextSalary: lead(employees.salary).over({ partitionBy: employees.department, orderBy: employees.id }),
 * }).from(employees);
 * ```
 *
 * @see lag to look at preceding rows instead
 */
export function lead<T extends SQLWrapper>(
	expression: T,
	offset?: number,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null>;
/**
 * When `defaultValue` is provided, the result keeps the expression's own type without the added
 * `null`.
 */
export function lead<T extends SQLWrapper>(
	expression: T,
	offset: number | undefined,
	defaultValue: T extends AnyColumn ? T['_']['data'] | SQLWrapper : unknown,
): SQL<T extends AnyColumn ? GetColumnData<T, 'query'> : string>;
export function lead<T extends SQLWrapper>(
	expression: T,
	offset?: number,
	defaultValue?: T extends AnyColumn ? T['_']['data'] | SQLWrapper : unknown,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	let fn: SQL;
	if (offset === undefined) {
		fn = sql`lead(${expression})`;
	} else {
		assertNonNegativeInteger('lead', 'offset', offset);
		const inlineOffset = sql.raw(String(offset));
		fn = defaultValue === undefined
			? sql`lead(${expression}, ${inlineOffset})`
			: sql`lead(${expression}, ${inlineOffset}, ${bindIfParam(defaultValue, expression)})`;
	}
	return fn.mapWith(is(expression, Column) ? expression : String) as any;
}

/**
 * Returns the value of `expression` on the first row of the window frame.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Lowest salary in each department
 * db.select({
 * 	lowest: firstValue(employees.salary).over({ partitionBy: employees.department, orderBy: employees.salary }),
 * }).from(employees);
 * ```
 *
 * @see lastValue for the value on the last row of the frame
 * @see nthValue for the value on the nth row of the frame
 */
export function firstValue<T extends SQLWrapper>(
	expression: T,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	return sql`first_value(${expression})`.mapWith(is(expression, Column) ? expression : String) as any;
}

/**
 * Returns the value of `expression` on the last row of the window frame.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Highest salary in each department
 * db.select({
 * 	highest: lastValue(employees.salary).over({ partitionBy: employees.department, orderBy: employees.salary }),
 * }).from(employees);
 * ```
 *
 * @see firstValue for the value on the first row of the frame
 * @see nthValue for the value on the nth row of the frame
 */
export function lastValue<T extends SQLWrapper>(
	expression: T,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	return sql`last_value(${expression})`.mapWith(is(expression, Column) ? expression : String) as any;
}

/**
 * Returns the value of `expression` on the nth row of the window frame (counting from 1),
 * or `null` when there is no such row.
 *
 * The returned expression must be followed by `.over(...)` to define the window.
 *
 * ## Examples
 *
 * ```ts
 * // Second-lowest salary in each department
 * db.select({
 * 	second: nthValue(employees.salary, 2).over({ partitionBy: employees.department, orderBy: employees.salary }),
 * }).from(employees);
 * ```
 *
 * @see firstValue for the value on the first row of the frame
 * @see lastValue for the value on the last row of the frame
 */
export function nthValue<T extends SQLWrapper>(
	expression: T,
	n: number,
): SQL<(T extends AnyColumn ? T['_']['data'] : string) | null> {
	if (!Number.isInteger(n) || n <= 0) {
		throw new Error(`nthValue() n must be a positive integer, but got ${String(n)}`);
	}
	return sql`nth_value(${expression}, ${sql.raw(String(n))})`.mapWith(
		is(expression, Column) ? expression : String,
	) as any;
}

/**
 * Frame bound matching the first row of the partition, for use as `from` or `to`
 * in an {@link SQL.over} frame.
 *
 * ## Examples
 *
 * ```ts
 * // Running total: everything from the first row up to the current one
 * sum(employees.salary).over({
 * 	orderBy: employees.id,
 * 	frame: { mode: 'rows', from: unboundedPreceding(), to: currentRow() },
 * });
 * ```
 */
export function unboundedPreceding(): WindowFrameBound {
	return new WindowFrameBound('unbounded preceding');
}

/**
 * Frame bound matching the row `offset` rows before the current row, for use as
 * `from` or `to` in an {@link SQL.over} frame.
 *
 * `offset` must be a non-negative integer; negative or decimal values throw.
 *
 * ## Examples
 *
 * ```ts
 * // Moving average over the previous, current and next row
 * avg(employees.salary).over({
 * 	orderBy: employees.id,
 * 	frame: { mode: 'rows', from: preceding(1), to: following(1) },
 * });
 * ```
 */
export function preceding(offset: number): WindowFrameBound {
	assertNonNegativeInteger('preceding', 'offset', offset);
	return new WindowFrameBound('preceding', offset);
}

/**
 * Frame bound matching the current row, for use as `from` or `to` in an
 * {@link SQL.over} frame.
 *
 * ## Examples
 *
 * ```ts
 * sum(employees.salary).over({
 * 	orderBy: employees.id,
 * 	frame: { mode: 'rows', from: unboundedPreceding(), to: currentRow() },
 * });
 * ```
 */
export function currentRow(): WindowFrameBound {
	return new WindowFrameBound('current row');
}

/**
 * Frame bound matching the row `offset` rows after the current row, for use as
 * `from` or `to` in an {@link SQL.over} frame.
 *
 * `offset` must be a non-negative integer; negative or decimal values throw.
 *
 * ## Examples
 *
 * ```ts
 * // Moving average over the previous, current and next row
 * avg(employees.salary).over({
 * 	orderBy: employees.id,
 * 	frame: { mode: 'rows', from: preceding(1), to: following(1) },
 * });
 * ```
 */
export function following(offset: number): WindowFrameBound {
	assertNonNegativeInteger('following', 'offset', offset);
	return new WindowFrameBound('following', offset);
}

/**
 * Frame bound matching the last row of the partition, for use as `from` or `to`
 * in an {@link SQL.over} frame.
 *
 * ## Examples
 *
 * ```ts
 * // Whole-partition total regardless of ordering
 * sum(employees.salary).over({
 * 	orderBy: employees.id,
 * 	frame: { mode: 'rows', from: unboundedPreceding(), to: unboundedFollowing() },
 * });
 * ```
 */
export function unboundedFollowing(): WindowFrameBound {
	return new WindowFrameBound('unbounded following');
}
