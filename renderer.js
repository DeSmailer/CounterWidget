let green = 0;
let red = 0;

const greenValue = document.getElementById('greenValue');
const redValue = document.getElementById('redValue');
const percent = document.getElementById('percent');

function update() {
    greenValue.textContent = green;
    redValue.textContent = red;

    const total = green + red;
    const greenPercent = total === 0 ? 0 : Math.round((green / total) * 100);

    percent.textContent = `${greenPercent}%`;
}

document.getElementById('greenPlus').addEventListener('click', () => {
    green++;
    update();
});

document.getElementById('greenMinus').addEventListener('click', () => {
    green--;
    update();
});

document.getElementById('redPlus').addEventListener('click', () => {
    red++;
    update();
});

document.getElementById('redMinus').addEventListener('click', () => {
    red--;
    update();
});

document.getElementById('reset').addEventListener('click', () => {
    green = 0;
    red = 0;
    update();
});

update();