// Built-in question sets for ALU Quiz Night. Each answer is a well-established fact; keep it that
// way when adding questions (no dates or numbers that change, no contested claims).

export type Question = { q: string; options: [string, string, string, string]; answer: 0 | 1 | 2 | 3 };
export type QuestionSet = { id: string; title: string; questions: Question[] };

export const SETS: QuestionSet[] = [
  {
    id: "alu",
    title: "All about ALU",
    questions: [
      { q: "Who founded African Leadership University?", options: ["Fred Swaniker", "Patrick Awuah", "Strive Masiyiwa", "Ory Okolloh"], answer: 0 },
      { q: "Fred Swaniker was born in which country?", options: ["Nigeria", "Kenya", "Ghana", "Rwanda"], answer: 2 },
      { q: "Besides Rwanda, ALU has a campus in which country?", options: ["Mauritius", "Morocco", "Senegal", "Botswana"], answer: 0 },
      { q: "Which architecture firm designed ALU's Kigali campus?", options: ["Adjaye Associates", "MASS Design Group", "Foster + Partners", "Kéré Architecture"], answer: 1 },
      { q: "At ALU, students pursue a mission instead of a…", options: ["Thesis", "Major", "Semester", "Club"], answer: 1 },
      { q: "African Leadership Academy, ALU's sister school, is near which city?", options: ["Nairobi", "Lagos", "Accra", "Johannesburg"], answer: 3 },
      { q: "ALU aims to develop how many ethical, entrepreneurial leaders by 2035?", options: ["30,000", "300,000", "3 million", "30 million"], answer: 2 },
      { q: "What does the Kinyarwanda word 'Ikaze', used for ALU's welcome week, mean?", options: ["Goodbye", "Welcome", "Study hard", "Good luck"], answer: 1 },
      { q: "Which ALU day puts staff against students in sports and games?", options: ["One ALU", "ALU Cup", "Founders' Day", "Ikaze"], answer: 0 },
      { q: "What is the Instagram account for student life at ALU?", options: ["@aluofficial", "@alukigali", "@lifeatalu", "@alustudents"], answer: 2 },
    ],
  },
  {
    id: "rwanda",
    title: "Rwanda & Kigali",
    questions: [
      { q: "What is the capital of Rwanda?", options: ["Huye", "Musanze", "Kigali", "Rubavu"], answer: 2 },
      { q: "Rwanda is often called the land of a thousand…", options: ["Lakes", "Hills", "Drums", "Rivers"], answer: 1 },
      { q: "What is the monthly community work day in Rwanda called?", options: ["Umuganda", "Imihigo", "Agaciro", "Ubudehe"], answer: 0 },
      { q: "Which of these is NOT an official language of Rwanda?", options: ["Kinyarwanda", "French", "Swahili", "Portuguese"], answer: 3 },
      { q: "What is Rwanda's currency?", options: ["Shilling", "Rwandan franc", "Cedi", "Birr"], answer: 1 },
      { q: "Volcanoes National Park is famous for which animals?", options: ["Lions", "Mountain gorillas", "Cheetahs", "Hippos"], answer: 1 },
      { q: "Which is the largest lake within Rwanda?", options: ["Lake Kivu", "Lake Muhazi", "Lake Burera", "Lake Ihema"], answer: 0 },
      { q: "'Murakoze' in Kinyarwanda means…", options: ["Hello", "Thank you", "Sorry", "Goodnight"], answer: 1 },
      { q: "The umushanana is a traditional outfit worn mainly by…", options: ["Women", "Drummers", "Kings", "Children"], answer: 0 },
      { q: "What is the name of Rwanda's national airline?", options: ["Kenya Airways", "RwandAir", "Ethiopian", "Air Kigali"], answer: 1 },
    ],
  },
  {
    id: "general",
    title: "General knowledge",
    questions: [
      { q: "What is the largest planet in our solar system?", options: ["Saturn", "Jupiter", "Neptune", "Earth"], answer: 1 },
      { q: "What is the chemical symbol for gold?", options: ["Go", "Gd", "Au", "Ag"], answer: 2 },
      { q: "What is the longest river in Africa?", options: ["Congo", "Niger", "Zambezi", "Nile"], answer: 3 },
      { q: "Who wrote 'Things Fall Apart'?", options: ["Wole Soyinka", "Chinua Achebe", "Ngũgĩ wa Thiong'o", "Chimamanda Ngozi Adichie"], answer: 1 },
      { q: "In which year did humans first land on the Moon?", options: ["1959", "1965", "1969", "1975"], answer: 2 },
      { q: "What is the fastest land animal?", options: ["Lion", "Cheetah", "Gazelle", "Horse"], answer: 1 },
      { q: "How many continents are there?", options: ["5", "6", "7", "8"], answer: 2 },
      { q: "H₂O is the chemical formula for…", options: ["Salt", "Oxygen", "Hydrogen", "Water"], answer: 3 },
      { q: "Which language structures the content of web pages?", options: ["HTML", "Python", "SQL", "C++"], answer: 0 },
      { q: "What is the square root of 144?", options: ["11", "12", "13", "14"], answer: 1 },
    ],
  },
];
