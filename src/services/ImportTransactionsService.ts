import { getCustomRepository, getRepository, In } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';
import Transaction from '../models/Transaction';
import Category from '../models/Category';

import TransactionsRepository from '../repositories/TransactionsRepository';

interface CSV {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactionsFile = fs.createReadStream(filePath);

    const parser = csvParse({
      from_line: 2,
    });

    const parseCsv = transactionsFile.pipe(parser);

    const transactions: CSV[] = [];
    const categories: string[] = [];

    parseCsv.on('data', async line => {
      const [title, type, value, category] = line.map((cell: string) =>
        cell.trim(),
      );

      if (!title || !type || !value) return;

      transactions.push({ title, type, value, category });
      categories.push(category);
    });

    await new Promise(resolve => parseCsv.on('end', resolve));

    const categoriesRepository = getRepository(Category);
    const transactionsRepository = getCustomRepository(TransactionsRepository);

    const allCategories = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const categoriesTitle = allCategories.map(
      (category: Category) => category.title,
    );

    const newCategories = categories
      .filter(categoryTitle => !categoriesTitle.includes(categoryTitle))
      .filter((category, index, self) => self.indexOf(category) === index);

    const createCategories = categoriesRepository.create(
      newCategories.map(categoryTitle => ({ title: categoryTitle })),
    );

    await categoriesRepository.save(createCategories);

    const allNewCategories = [...createCategories, ...allCategories];

    const createTransactions = transactionsRepository.create(
      transactions.map(transaction => ({
        title: transaction.title,
        type: transaction.type,
        value: transaction.value,
        category: allNewCategories.find(
          category => category.title === transaction.category,
        ),
      })),
    );

    await transactionsRepository.save(createTransactions);

    await fs.promises.unlink(filePath);

    return createTransactions;
  }
}

export default ImportTransactionsService;
