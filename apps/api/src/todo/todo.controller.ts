import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TodoService } from './todo.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtUser } from '../auth/jwt.strategy';

@Controller('api/v1/todo')
@UseGuards(JwtAuthGuard)
export class TodoController {
  constructor(private readonly todo: TodoService) {}

  // ─── People ───

  @Get('people')
  listPeople() {
    return this.todo.listPeopleWithCounts();
  }

  @Post('people')
  createPerson(@Body() dto: { name: string; email?: string | null }) {
    return this.todo.createPerson(dto);
  }

  @Patch('people/:personId')
  updatePerson(
    @Param('personId') personId: string,
    @Body() dto: { name?: string; email?: string | null },
  ) {
    return this.todo.updatePerson(personId, dto);
  }

  @Delete('people/:personId')
  deletePerson(@Param('personId') personId: string) {
    return this.todo.deletePerson(personId);
  }

  // ─── Tasks ───

  @Get('people/:personId/tasks')
  listTasks(@Param('personId') personId: string) {
    return this.todo.listTasksForPerson(personId);
  }

  @Post('people/:personId/tasks')
  createTask(
    @Param('personId') personId: string,
    @Body() dto: { title: string; priority?: string },
  ) {
    return this.todo.createTask(personId, dto);
  }

  @Post('people/:personId/tasks/reorder')
  reorder(
    @Param('personId') personId: string,
    @Body('orderedIds') orderedIds: string[],
  ) {
    return this.todo.reorderTasks(personId, orderedIds);
  }

  @Patch('tasks/:taskId')
  updateTask(
    @Param('taskId') taskId: string,
    @Body() dto: { title?: string; priority?: string; isDone?: boolean },
  ) {
    return this.todo.updateTask(taskId, dto);
  }

  @Delete('tasks/:taskId')
  deleteTask(@Param('taskId') taskId: string) {
    return this.todo.deleteTask(taskId);
  }

  // ─── Notes ───

  @Get('tasks/:taskId/notes')
  listNotes(@Param('taskId') taskId: string) {
    return this.todo.listAllNotes(taskId);
  }

  @Post('tasks/:taskId/notes')
  addNote(
    @Param('taskId') taskId: string,
    @Body('content') content: string,
    @CurrentUser() user: JwtUser,
  ) {
    return this.todo.addNote(taskId, content, user.userId);
  }

  @Delete('notes/:noteId')
  deleteNote(@Param('noteId') noteId: string) {
    return this.todo.deleteNote(noteId);
  }
}
