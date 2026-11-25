// Faithfulness for SQL routines: every case is a minimal copy of a function graded false (D) or misleading (C) in an
// independent review of ThunderLang 1.0.3 readings of pg_partman (PL/pgSQL), mysql-sys (MySQL stored programs), and
// the SQL Server First Responder Kit (T-SQL); the sample is in the test name. A routine body is parsed block by block,
// so a step is always on the side of the question the code puts it on, and anything Thunder cannot say exactly is
// shown as code.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { thunderText, sideOf } from './faithfulness-helpers.mjs';
import { readRepo, readFiles } from '../src/read-repo.mjs';
import { thunderModel } from '../src/model.mjs';

const pg = (body, head = 'CREATE FUNCTION f(p_parent_table text) RETURNS void AS $$') => thunderText('f.sql', `${head}\n${body}\n$$ LANGUAGE plpgsql;\n`);
const my = (body, head = "CREATE DEFINER='root'@'localhost' PROCEDURE p (IN in_x INT)") => thunderText('p.sql', `DELIMITER $$\n${head}\n${body}$$\nDELIMITER ;\n`);

test('pg_partman #1: an ELSE branch\'s RAISE is a Stop on the No side, not an unconditional Stop in the loop', () => {
  const t = pg(`DECLARE v_row record; v_tablename text;
BEGIN
FOR v_row IN SELECT parent_table, last_partition FROM part_config LOOP
    IF v_row.last_partition IS NOT NULL THEN
        SELECT tablename INTO v_tablename FROM pg_tables WHERE schemaname = 'x';
        IF v_tablename IS NULL THEN
            RAISE EXCEPTION 'ERROR: Last known partition table missing for parent table %.', v_row.parent_table;
        END IF;
    ELSE
        RAISE EXCEPTION 'ERROR: Last known partition missing from config table for parent table %.', p_parent_table;
    END IF;
    PERFORM run_step(v_row.parent_table);
END LOOP;
END`);
  assert.equal(sideOf(t, /Ask: Is the row's last partition set\?/, /Last known partition missing from config table/), 'no');
  assert.equal(sideOf(t, /Ask: Is tablename empty\?/, /Last known partition table missing/), 'yes');
  // The step after the IF runs on every pass that did not stop: it is not inside either side.
  assert.equal(sideOf(t, /Ask: Is the row's last partition set\?/, /Runs run step/), null);
  assert.match(t, /For each row \(row\) the query finds/);
});

test('pg_partman #3 / #13: a block of steps stays inside its IF, and the ELSE side keeps its own steps', () => {
  const t = pg(`DECLARE v_child_min bigint; v_undo_count int := 0;
BEGIN
<<outer_child_loop>>
LOOP
    IF v_child_min IS NULL THEN
        EXECUTE format('ALTER TABLE %I.%I NO INHERIT %I', 'a', 'b', 'c');
        IF p_keep_table = false THEN
            EXECUTE 'DROP TABLE x';
        ELSE
            PERFORM update_step(v_step_id, 'OK', 'Child table UNINHERITED, not DROPPED');
        END IF;
        v_undo_count := v_undo_count + 1;
        CONTINUE outer_child_loop;
    END IF;
    EXIT outer_child_loop;
END LOOP outer_child_loop;
RETURN;
END`, 'CREATE FUNCTION f(p_keep_table boolean) RETURNS void AS $$');
  assert.equal(sideOf(t, /Ask: Is child min empty\?/, /Sets undo count to undo count \+ 1/), 'yes');
  assert.equal(sideOf(t, /Ask: Is child min empty\?/, /Runs the SQL "ALTER TABLE «'a' as %I»\.«'b' as %I» NO INHERIT «'c' as %I»"/), 'yes');
  assert.equal(sideOf(t, /Ask: Is keep table false\?/, /Runs update step/), 'no');
  assert.equal(sideOf(t, /Ask: Is child min empty\?/, /Skips to the next round of the loop \(outer_child_loop\)/), 'yes');
  assert.match(t, /Leaves the loop \(outer_child_loop\)/);
});

test('pg_partman #5 / #6 / #8 / #10: ELSIF x = \'id\' is a question, never "Sets x to "id""', () => {
  const t = pg(`BEGIN
IF v_row.partition_type = 'time' THEN
    PERFORM a();
ELSIF v_row.partition_type = 'id' THEN
    PERFORM b();
ELSIF v_control_parent_type = 'id' AND v_control_sub_type = 'id' THEN
    PERFORM c();
ELSIF p_order = 'DESC' THEN
    PERFORM d();
ELSE
    RAISE EXCEPTION 'Invalid value for p_order. Must be ASC or DESC';
END IF;
END`);
  assert.doesNotMatch(t, /Sets (?:the row's )?partition type|Sets control parent type|Sets order to/);
  assert.match(t, /Ask: Is the row's partition type "id"\?/);
  assert.match(t, /Ask: Control parent type is "id" and control sub type is "id"\?/);
  assert.equal(sideOf(t, /Ask: Is order "DESC"\?/, /Invalid value for p_order/), 'no');
  assert.equal(sideOf(t, /Ask: Is order "DESC"\?/, /Runs d/), 'yes');
});

test('pg_partman #5 / #10: CONTINUE inside a nested ELSE skips only on that side', () => {
  const t = pg(`BEGIN
FOR v_row IN SELECT * FROM part_config LOOP
    IF v_current_partition_timestamp IS NULL THEN
        IF v_row.infinite_time_partitions IS TRUE THEN
            v_current_partition_timestamp = CURRENT_TIMESTAMP;
        ELSE
            -- Nothing to do
            CONTINUE;
        END IF;
    END IF;
    PERFORM make_partition(v_row.parent_table);
END LOOP;
END`);
  const lines = t.split('\n');
  const skip = lines.findIndex((l) => /Skips to the next round of the loop/.test(l));
  const outer = lines.findIndex((l) => /Ask: Is current partition timestamp empty\?/.test(l));
  assert.ok(skip > outer && outer >= 0, t);
  assert.equal(sideOf(t, /Ask: Is current partition timestamp empty\?/, /Skips to the next round/), 'yes');
  assert.equal(sideOf(t, /Ask: Is current partition timestamp empty\?/, /Runs make partition/), null);
});

test('pg_partman #11 / #12: steps inside a CASE ELSE and inside a FOR loop stay there; a CASE with no ELSE fails when nothing matches', () => {
  const t = pg(`DECLARE v_id_interval bigint; v_time_interval interval; v_partition_id_array bigint[];
BEGIN
CASE
    WHEN p_interval = 'yearly' THEN
        v_time_interval = '1 year';
    ELSE
        IF p_type = 'id-static' OR p_type = 'id-dynamic' THEN
            v_id_interval := p_interval::bigint;
        ELSE
            RAISE EXCEPTION 'Invalid interval for time based partitioning: %', p_interval;
        END IF;
END CASE;
IF p_type = 'id-static' THEN
    FOR i IN 0..p_premake LOOP
        v_partition_id_array = array_append(v_partition_id_array, i);
    END LOOP;
END IF;
CASE p_order WHEN 'ASC' THEN PERFORM a(); END CASE;
END`, 'CREATE FUNCTION f(p_interval text, p_type text, p_premake int, p_order text) RETURNS void AS $$');
  assert.equal(sideOf(t, /Ask: Is interval "yearly"\?/, /Invalid interval for time based partitioning: «p_interval»/), 'no');
  assert.equal(sideOf(t, /Ask: Type is "id-static" or type is "id-dynamic"\?/, /Invalid interval/), 'no');
  assert.equal(sideOf(t, /Ask: Is type "id-static"\?/, /Counts i from 0 to premake/), 'yes');
  assert.equal(sideOf(t, /Ask: Is order "ASC"\?/, /no WHEN matched and there is no ELSE/), 'no');
});

test('pg_partman #14: an IF with a RAISE inside is a question, not a Stop on every path', () => {
  const t = pg(`BEGIN
IF position('.' in p_parent_table) = 0 THEN
    RAISE EXCEPTION 'Parent table must be schema qualified';
END IF;
IF p_start_partition IS NOT NULL THEN
    v_max := p_start_partition::bigint;
ELSE
    v_sql := format('SELECT COALESCE(max(%I)::bigint, 0) FROM %I.%I LIMIT 1', 'a', 'b', 'c');
END IF;
END`, 'CREATE FUNCTION f(p_parent_table text, p_start_partition text) RETURNS void AS $$');
  assert.doesNotMatch(t, /^ {2}- Stop: an error: "Parent table must be schema qualified"/m);
  assert.equal(sideOf(t, /Ask: Is start partition set\?/, /Sets sql to/), 'no');
});

test('pg_partman #2 / #4 / #7 / #9 / #15: RETURN is shown; RETURN NEXT and RETURN QUERY add rows and carry on; record fields keep their record', () => {
  const t = pg(`DECLARE v_trouble record; v_count int;
BEGIN
FOR v_tables IN SELECT parent_table FROM part_config LOOP
    IF v_count > 0 THEN
        v_trouble.parent_table := v_tables.parent_table;
        v_trouble.count := v_count;
        RETURN NEXT v_trouble;
    END IF;
END LOOP;
IF p_order = 'ASC' THEN
    RETURN QUERY EXECUTE 'SELECT 1';
END IF;
RETURN;
END`, 'CREATE FUNCTION check_parent(p_order text) RETURNS SETOF record AS $$');
  assert.match(t, /Sets the trouble's count to count/);
  assert.match(t, /Adds trouble to the rows it gives back, and carries on/);
  assert.match(t, /Adds the rows of a query built when it runs to the rows it gives back, and carries on/);
  assert.match(t, /Gives back the rows it has added/);
  assert.doesNotMatch(t, /Gives back NEXT|Gives back QUERY/);
  const r = pg('DECLARE v_result boolean;\nBEGIN\n  SELECT p_x IN (\'on\', \'off\') INTO v_result;\n  RETURN v_result;\nEND', 'CREATE FUNCTION check_value(p_x text) RETURNS boolean AS $$');
  assert.match(r, /Gives back result/);
});

test('mysql-sys #4 / #10: IF v_done THEN LEAVE leaves the loop; EXECUTE runs the prepared statement', () => {
  const t = my(`BEGIN
  DECLARE v_done BOOL DEFAULT FALSE;
  DECLARE ps_tables CURSOR FOR SELECT table_name FROM information_schema.tables;
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET v_done = TRUE;
  OPEN ps_tables;
  ps_tables_loop: LOOP
    FETCH ps_tables INTO v_ps_table;
    IF v_done THEN
      LEAVE ps_tables_loop;
    END IF;
    SET @truncate_stmt := CONCAT('TRUNCATE TABLE performance_schema.', v_ps_table);
    PREPARE truncate_stmt FROM @truncate_stmt;
    EXECUTE truncate_stmt;
    DEALLOCATE PREPARE truncate_stmt;
  END LOOP;
  CLOSE ps_tables;
END`);
  assert.equal(sideOf(t, /Ask: Done\?/, /Leaves the loop \(ps_tables_loop\)/), 'yes');
  assert.doesNotMatch(t, /Ask: Done\?[^\n]*\n\s+Yes: continue/);
  assert.match(t, /Runs the prepared statement truncate_stmt/);
  assert.match(t, /From here on, whenever no row is found: sets done to yes, then carries on/);
  assert.match(t, /Takes the next row of ps_tables into ps table/);
  assert.match(t, /Sets `@truncate_stmt` to CONCAT\("TRUNCATE TABLE performance_schema\.", ps table\)/);
});

test('mysql-sys #6: IF bytes IS NULL THEN RETURN NULL gives back NULL; the input is shown', () => {
  const t = thunderText('f.sql', "DELIMITER $$\nCREATE DEFINER='root'@'localhost' FUNCTION format_bytes (\n  -- a comment\n  bytes TEXT\n)\n  RETURNS TEXT\n  COMMENT 'x'\n  SQL SECURITY INVOKER\n  DETERMINISTIC\n  NO SQL\nBEGIN\n  IF bytes IS NULL THEN RETURN NULL;\n  ELSEIF bytes >= 1024 THEN RETURN CONCAT(ROUND(bytes / 1024, 2), ' KiB');\n  ELSE RETURN CONCAT(ROUND(bytes, 0), ' bytes');\n  END IF;\nEND$$\nDELIMITER ;\n");
  assert.match(t, /You give it: bytes/);
  assert.equal(sideOf(t, /Ask: Is bytes empty\?/, /Gives back NULL/), 'yes');
  assert.equal(sideOf(t, /Ask: Is bytes at least 1024\?/, /" bytes"/), 'no');
});

test('mysql-sys #2 / #4: a SIGNAL inside an IF or a CASE ELSE is conditional', () => {
  const t = my(`BEGIN
  IF (in_max_runtime < in_interval) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'in_max_runtime must be greater than or equal to in_interval';
  END IF;
  CASE
    WHEN in_action = 'cleanup' THEN
      DO (SELECT 1);
    ELSE
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Unknown action';
  END CASE;
  IF (NOT INSTR(@sys.statement_performance_analyzer.view, ' ')) THEN
    SET v_custom_db = 'a';
  ELSE
    SET v_sql = 'b';
  END IF;
END`, "CREATE DEFINER='root'@'localhost' PROCEDURE p (IN in_max_runtime INT, IN in_interval INT, IN in_action TEXT)");
  assert.equal(sideOf(t, /Ask: Is max runtime less than interval\?/, /in_max_runtime must be greater/), 'yes');
  assert.equal(sideOf(t, /Ask: Is action "cleanup"\?/, /Unknown action/), 'no');
  // NOT INSTR(…): the question keeps its negation (the No side is where INSTR finds a space).
  assert.equal(sideOf(t, /Ask: INSTR\(`@sys\.statement_performance_analyzer\.view`, " "\)\?/, /Sets custom db to "a"/), 'no');
  assert.equal(sideOf(t, /Ask: INSTR\(`@sys\.statement_performance_analyzer\.view`, " "\)\?/, /Sets sql to "b"/), 'yes');
});

test('mysql-sys #11 / pg_partman #15: quoted text is kept exactly (underscores, =, quotes inside)', () => {
  const t = thunderText('f.sql', "DELIMITER $$\nCREATE FUNCTION ps_thread_stack (thd_id BIGINT) RETURNS LONGTEXT\nBEGIN\n  RETURN CONCAT('{', CONCAT('\"stack_created\": \"', NOW(), '\"'), CONCAT('\"mysql_version\": \"', VERSION(), '\"'), '}');\nEND$$\nDELIMITER ;\n");
  assert.match(t, /stack_created/);
  assert.match(t, /mysql_version/);
  assert.doesNotMatch(t, /stack created|mysql version/);
  const q = pg("BEGIN\n  IF p_x IN ('create_table', 'create_tmp') THEN\n    v_sql := 'SELECT * FROM t WHERE a = 1';\n    v_msg := 'Moving table '||v_child_table||' to schema '||v_schema;\n  END IF;\nEND", 'CREATE FUNCTION f(p_x text) RETURNS void AS $$');
  assert.match(q, /Is x one of "create_table", "create_tmp"\?/);
  assert.match(q, /Sets sql to "SELECT \* FROM t WHERE a = 1"/);
  assert.match(q, /Sets msg to "Moving table «v_child_table» to schema «v_schema»"/);
});

test('every routine spans its whole body, not only its first line', () => {
  const src = 'CREATE FUNCTION f(p_a int) RETURNS int AS $$\nBEGIN\n  IF p_a > 0 THEN\n    RETURN 1;\n  END IF;\n  RETURN 0;\nEND;\n$$ LANGUAGE plpgsql;\n\nCREATE VIEW v AS\nSELECT id\nFROM t;\n';
  const model = thunderModel(readFiles([{ path: 'a.sql', source: src }]), { name: 'x' });
  assert.deepEqual(model.members.map((m) => [m.name, m.lines]), [['f', [1, 8]], ['v', [10, 12]]]);
});

test('SQL Server First Responder Kit: T-SQL procedures (no parentheses, AS BEGIN … END, GO) are read', () => {
  const src = `IF OBJECT_ID('dbo.sp_x') IS NULL
  EXEC ('CREATE PROCEDURE dbo.sp_x AS RETURN 0;');
GO
ALTER PROCEDURE [dbo].[sp_x]
    @Help TINYINT = 0 ,
    @Top INT = 10,
    @Version VARCHAR(30) = NULL OUTPUT
WITH RECOMPILE
AS
BEGIN
SET NOCOUNT ON;
SELECT @Version = '8.35';
IF @Help = 1
BEGIN
    PRINT 'Help text';
    RETURN;
END
ELSE IF @Top > 100
    RAISERROR('Top is large; carrying on', 16, 1) WITH NOWAIT;
ELSE
    SET @Top = 5
DECLARE @msg NVARCHAR(4000) = N'Starting', @i INT = 0;
RAISERROR(@msg, 0, 1) WITH NOWAIT;
WHILE @i < @Top
BEGIN
    SET @i = @i + 1;
    IF @i = 3 CONTINUE;
    IF @i = 7 BREAK;
END
BEGIN TRY
    EXEC dbo.do_work @Top = @Top;
    RAISERROR('Inside try', 16, 1);
END TRY
BEGIN CATCH
    THROW 50000, 'Work failed', 1;
END CATCH
SELECT name FROM sys.databases
END;
GO
CREATE PROCEDURE dbo.sp_y AS SELECT 1;
GO
`;
  const model = thunderModel(readFiles([{ path: 'sp_x.sql', source: src }]), { name: 'x' });
  assert.deepEqual(model.members.map((m) => [m.name, m.lines]), [['sp_x', [4, 38]], ['sp_y', [40, 40]]]);
  const t = thunderText('sp_x.sql', src);
  assert.match(t, /You give it: help, top, version/);
  assert.match(t, /You get back: version/);
  assert.equal(sideOf(t, /Ask: Is help 1\?/, /Writes a message: "Help text"/), 'yes');
  assert.equal(sideOf(t, /Ask: Is help 1\?/, /Stops here/), 'yes');
  // RAISERROR with severity 16 outside TRY reports the error and carries on: not a Stop.
  assert.match(t, /Reports an error and carries on \(unless a TRY … CATCH that called it catches the error\): "Top is large; carrying on"/);
  assert.equal(sideOf(t, /Ask: Is top more than 100\?/, /Sets top to 5/), 'no');
  assert.match(t, /Writes a message: the text in msg/);
  assert.match(t, /While i is less than top/);
  assert.equal(sideOf(t, /Ask: Is i 3\?/, /Skips to the next round of the loop/), 'yes');
  assert.equal(sideOf(t, /Ask: Is i 7\?/, /Leaves the loop/), 'yes');
  assert.match(t, /Tries these steps and handles any error/);
  assert.match(t, /Stop: an error: "Inside try"/); // inside TRY, severity 16 goes to CATCH
  assert.match(t, /If anything goes wrong:\n\s+- Stop: an error: "Work failed"/);
});

test('dbt models (Jinja templates) are listed as skipped with the reason, never guessed', () => {
  const src = "{{ config(materialized='table') }}\n\nwith orders as (\n  select * from {{ ref('stg_orders') }}\n)\nselect * from orders\n";
  const repo = readRepo([{ path: 'models/orders.sql', source: src }]);
  assert.equal(repo.skipped.length, 1);
  assert.match(repo.skipped[0].reason, /dbt or Jinja template/);
  const model = thunderModel(readFiles([{ path: 'models/orders.sql', source: src }]), { name: 'x' });
  assert.equal(model.members.length, 0);
  assert.match(model.unknowns[0].why, /never guessed/);
});

test('a body whose blocks do not match is not read: no guessed steps', () => {
  const model = thunderModel(readFiles([{ path: 'a.sql', source: 'CREATE FUNCTION f() RETURNS void AS $$\nBEGIN\n  IF x THEN\n    RAISE EXCEPTION \'boom\';\nEND;\n$$ LANGUAGE plpgsql;\n' }]), { name: 'x' });
  const m = model.members.find((x) => x.name === 'f');
  assert.equal(m.kind, 'not-read');
  assert.ok(!m.flow.nodes.some((n) => n.kind === 'stop'));
});

test('OUT parameters are what it gives back, not inputs', () => {
  const t = my('BEGIN\n  SET out_exists = \'\';\nEND', "CREATE DEFINER='root'@'localhost' PROCEDURE table_exists (IN in_db VARCHAR(64), IN in_table VARCHAR(64), OUT out_exists ENUM('', 'BASE TABLE'))");
  assert.match(t, /You give it: db, table\n/);
  assert.match(t, /You get back: exists/);
});
