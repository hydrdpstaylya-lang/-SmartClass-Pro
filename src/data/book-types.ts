export type StudySection={title:string;text:string}
export type WorkedExample={question:string;steps:string[];answer:string}
export type StudyExercise={prompt:string;answer:string;hint:string}
export type StudyQuiz={prompt:string;options:string[];answer:number;explanation:string}
export type AuthoredContent={number:number;sections:StudySection[];workedExample:WorkedExample;commonMistakes:string[];exercises:StudyExercise[];quickQuiz:StudyQuiz;sourceUrl:string;scopeNote:string}
