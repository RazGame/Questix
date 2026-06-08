export default function Home() {
  return (
    <div className="min-h-[calc(100vh-4rem)] bg-gradient-to-r from-primary to-secondary text-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 py-10 md:py-14 text-center">
        <h1 className="text-4xl md:text-6xl font-bold mb-4">⚔️ Questix</h1>
        <p className="text-xl md:text-2xl mb-8">
          Организуйте и найдите квесты с единомышленниками
        </p>

        <div className="grid md:grid-cols-3 gap-6 mt-10 md:mt-14">
          <div className="bg-white bg-opacity-10 p-6 md:p-8 rounded-lg backdrop-blur">
            <h3 className="text-xl md:text-2xl font-bold mb-3">🎯 Квесты</h3>
            <p>Обширный каталог квестов на любой вкус</p>
          </div>

          <div className="bg-white bg-opacity-10 p-6 md:p-8 rounded-lg backdrop-blur">
            <h3 className="text-xl md:text-2xl font-bold mb-3">👥 Команда</h3>
            <p>Найдите команду единомышленников</p>
          </div>

          <div className="bg-white bg-opacity-10 p-6 md:p-8 rounded-lg backdrop-blur">
            <h3 className="text-xl md:text-2xl font-bold mb-3">🏆 Приз</h3>
            <p>Выигрывайте призы и награды</p>
          </div>
        </div>

        <div className="mt-10 md:mt-14">
          <a
            href="/games"
            className="bg-white text-primary px-8 py-3 rounded-lg font-bold text-lg hover:bg-opacity-90 transition inline-block"
          >
            Начать искать квесты
          </a>
        </div>
      </div>
    </div>
  );
}
