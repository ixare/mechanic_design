import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { parseMcqOption } from '../js/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const questionsPath = path.join(rootDir, 'questions.js');

/**
 * 加载并校验 questions.js 题库完整性
 */
export function validateQuestionBank(filePath = questionsPath) {
    const code = fs.readFileSync(filePath, 'utf8');
    const sandbox = { window: {} };
    vm.runInNewContext(code, sandbox);

    const mcq = sandbox.window.mcq_data;
    const tf = sandbox.window.tf_data;
    const errors = [];
    const warnings = [];

    if (!Array.isArray(mcq) || !Array.isArray(tf)) {
        return {
            ok: false,
            errors: ['mcq_data 或 tf_data 缺失或不是数组'],
            warnings,
            stats: { mcqCount: 0, tfCount: 0 }
        };
    }

    const seenIds = new Set();

    const checkMathDelimiters = (text, label) => {
        const cleaned = String(text || '').replace(/\\\$/g, '');
        const dollars = cleaned.match(/\$/g);
        if (dollars && dollars.length % 2 !== 0) {
            errors.push(`${label}: $ 数学公式分隔符数量不成对`);
        }
    };

    mcq.forEach((item, index) => {
        const label = `mcq[${index}] (${item.id || 'no-id'})`;
        if (!item.id || typeof item.id !== 'string') {
            errors.push(`${label}: 缺少字符串类型的唯一 id`);
        } else if (seenIds.has(item.id)) {
            errors.push(`${label}: 存在重复 id "${item.id}"`);
        } else {
            seenIds.add(item.id);
        }

        if (!item.chapter || !String(item.chapter).trim()) {
            errors.push(`${label}: chapter 不能为空`);
        }
        if (!item.question || !String(item.question).trim()) {
            errors.push(`${label}: question 不能为空`);
        }
        if (!Array.isArray(item.options) || item.options.length < 2) {
            errors.push(`${label}: options 至少需要 2 个选项`);
        } else {
            const keys = item.options.map(opt => parseMcqOption(opt).key);
            if (keys.some(k => !k)) {
                errors.push(`${label}: 存在缺少字母前缀的选项`);
            }
            const answer = String(item.answer || '').trim().toUpperCase();
            if (!keys.includes(answer)) {
                errors.push(`${label}: 答案 "${item.answer}" 不在选项键值 [${keys.join(', ')}] 中`);
            }
        }

        checkMathDelimiters(item.question, `${label}.question`);
        (item.options || []).forEach((opt, optIdx) => {
            checkMathDelimiters(opt, `${label}.options[${optIdx}]`);
        });
        checkMathDelimiters(item.explanation, `${label}.explanation`);

        if (/<script/i.test(item.explanation || '')) {
            errors.push(`${label}: explanation 包含不安全脚本标签`);
        }
        if (!item.explanation) {
            warnings.push(`${label}: 缺少解析`);
        }
    });

    tf.forEach((item, index) => {
        const label = `tf[${index}] (${item.id || 'no-id'})`;
        if (!item.id || typeof item.id !== 'string') {
            errors.push(`${label}: 缺少字符串类型的唯一 id`);
        } else if (seenIds.has(item.id)) {
            errors.push(`${label}: 存在重复 id "${item.id}"`);
        } else {
            seenIds.add(item.id);
        }

        if (!item.chapter || !String(item.chapter).trim()) {
            errors.push(`${label}: chapter 不能为空`);
        }
        if (!item.question || !String(item.question).trim()) {
            errors.push(`${label}: question 不能为空`);
        }
        if (!['✓', '×'].includes(String(item.answer || '').trim())) {
            errors.push(`${label}: 判断题答案必须为 "✓" 或 "×"，实际为 "${item.answer}"`);
        }

        checkMathDelimiters(item.question, `${label}.question`);
        checkMathDelimiters(item.explanation, `${label}.explanation`);

        if (/<script/i.test(item.explanation || '')) {
            errors.push(`${label}: explanation 包含不安全脚本标签`);
        }
    });

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        stats: { mcqCount: mcq.length, tfCount: tf.length, total: mcq.length + tf.length }
    };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const result = validateQuestionBank();
    console.log(`题库检查完成：选择题 ${result.stats.mcqCount} 道，判断题 ${result.stats.tfCount} 道，共 ${result.stats.total} 道。`);
    if (result.warnings.length > 0) {
        console.warn(`警告 (${result.warnings.length}):\n` + result.warnings.slice(0, 10).join('\n'));
    }
    if (!result.ok) {
        console.error(`发现 ${result.errors.length} 处错误：\n` + result.errors.join('\n'));
        process.exit(1);
    }
    console.log('校验通过：0 错误。');
}
